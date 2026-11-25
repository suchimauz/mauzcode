import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dockerAvailable, startSshFixture, type SshFixture } from '../../test/ssh/fixture';
import { mkTestCtx } from '../_testCtx.entry';

// A server skill read from an SSH workspace is copied to that host's ~/.cache, runnable by the agent's own bash.
const enabled = process.env.MAUZCODE_SKIP_DOCKER_TESTS !== '1' && await dockerAvailable();
let fixture: SshFixture | null = null;
let ctx: any;
let base = '';
const remoteDir = '/tmp/skill-materialize-project';

describe.skipIf(!enabled)('server skills on an SSH workspace', () => {
    beforeAll(async () => {
        fixture = await startSshFixture();
        if (!fixture) throw Error('Docker SSH fixture unavailable');
        base = mkdtempSync(join(tmpdir(), 'skill-materialize-it-'));
        ctx = await mkTestCtx({ env: { ...fixture.env, CDP_BROWSER_URL: 'http://127.0.0.1:1', MAUZCODE_SKILLS_DIR: join(base, 'library') } });
        const located = await ctx.fns.skills.serverLibrary({ workspace: { host: 'rg', dir: remoteDir } });
        mkdirSync(join(located.globalDir, 'review/scripts'), { recursive: true });
        writeFileSync(join(located.globalDir, 'review/SKILL.md'), '---\nname: review\ndescription: Review with a script.\n---\nRun scripts/check.sh.\n');
        writeFileSync(join(located.globalDir, 'review/scripts/check.sh'), '#!/bin/sh\necho remote-checked\n', { mode: 0o755 });
        expect((await ctx.fns.remote.exec({ host: 'rg', command: `rm -rf ${remoteDir} ~/.cache/mauzcode && mkdir -p ${remoteDir} && cd ${remoteDir} && git init -q` })).exitCode).toBe(0);
    }, 240_000);

    afterAll(async () => {
        try {
            if (fixture && ctx) await ctx.fns.remote.exec({ host: 'rg', command: `chmod -R u+w ~/.cache/mauzcode 2>/dev/null; rm -rf ${remoteDir} ~/.cache/mauzcode` });
        } finally {
            await fixture?.stop();
            if (base) rmSync(base, { recursive: true, force: true });
        }
    });

    test('read_skill returns a remote cache directory whose script runs with bash and leaves the repository clean', async () => {
        const agent = await ctx.fns.agent.start({ model: 'mock:test', workspaceDir: remoteDir, workspaceHost: 'rg', preset: await ctx.fns.agentPreset.resolve({ id: 'standard' }) });
        const read = await ctx.fns.tools.call({ name: 'read_skill', agent, args: { id: 'skill.server.global:review' } });
        expect(read.isError).toBe(false);
        const directory = /directory: (\/\S+)/.exec(read.output)?.[1];
        expect(directory).toMatch(/\/\.cache\/mauzcode\/skills\/skill\.server\.global:review\/[0-9a-f]{32}$/);
        const run = await ctx.fns.tools.call({ name: 'bash', agent, args: { command: `${directory}/scripts/check.sh && stat -c %a ${directory}/scripts/check.sh ${directory}/SKILL.md && git status --porcelain` } });
        expect(run.output.trim().split('\n')).toEqual(['remote-checked', '555', '444']);
    });
    test('a reviewed workspace skill is published atomically on the SSH host and never overwrites', async () => {
        const workspace = { host: 'rg', dir: remoteDir };
        const files = [{ path: 'SKILL.md', data: Buffer.from('---\nname: remote\ndescription: Remote.\n---\nRemote.\n').toString('base64'), executable: false },
            { path: 'scripts/go.sh', data: Buffer.from('#!/bin/sh\necho go\n').toString('base64'), executable: true }];
        const draft = { id: crypto.randomUUID(), agentId: 'a', workspace, destination: 'workspace' as const, skillId: 'skill.workspace:remote', name: 'remote',
            digest: ctx.fns.skills.filesDigest({ files }), source: 'test', files, originals: {}, expiresAt: Date.now() + 60_000 };
        const [one, two] = await Promise.all([ctx.fns.skills.publish({ draft }), ctx.fns.skills.publish({ draft })]);
        expect([one.ok, two.ok].sort()).toEqual([false, true]);
        expect([one, two].find((r: any) => !r.ok)).toMatchObject({ conflict: true });
        const check = await ctx.fns.remote.exec({ host: 'rg', command: `cd ${remoteDir}/.mauzcode/skills && ls -A && ./remote/scripts/go.sh` });
        expect(check.stdout.trim().split('\n')).toEqual(['remote', 'go']);
        const scan = await ctx.fns.skills.workspaceSource({ workspace });
        expect(scan.ok && scan.action === 'scan' && scan.packages.map((p: any) => p.descriptor.id)).toEqual(['skill.workspace:remote']);
    });
});
