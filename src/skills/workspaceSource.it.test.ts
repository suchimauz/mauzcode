import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dockerAvailable, startSshFixture, type SshFixture } from '../../test/ssh/fixture';
import { mkTestCtx } from '../_testCtx.entry';

const enabled = process.env.MAUZCODE_SKIP_DOCKER_TESTS !== '1' && await dockerAvailable();
const manifest = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\nInstructions.\n`;
let fixture: SshFixture | null = null;
let ctx: Context;
let active: Context;
let dir = '';

async function switchTo(host: string) {
    await active.fns.workspace.set({ dir, host });
    const workspace = active.fns.workspace.get({});
    expect(workspace).toMatchObject({ dir, host });
    return workspace;
}

async function put(host: string, relative: string, text: string) {
    const quote = (value: string) => ctx.fns.remote.quote({ value });
    const prefix = relative.slice(0, relative.lastIndexOf('/'));
    const result = await ctx.fns.remote.exec({ host, command: `mkdir -p -- ${quote(join(dir, prefix))} && cat > ${quote(join(dir, relative))}`, stdin: text });
    expect(result.exitCode).toBe(0);
}

async function scan(workspace: { host: string; dir: string }) {
    const result = await active.fns.skills.workspaceSource({ workspace });
    if (!result.ok || result.action !== 'scan') throw Error('expected workspace scan');
    return { ...result, ids: result.packages.map(entry => entry.descriptor.id) };
}

const localPut = (relative: string, text: string) => {
    mkdirSync(join(dir, relative.slice(0, relative.lastIndexOf('/'))), { recursive: true });
    writeFileSync(join(dir, relative), text);
};

describe.skipIf(!enabled)('workspace skills over isolated SSH', () => {
    beforeAll(async () => {
        fixture = await startSshFixture();
        if (!fixture) throw Error('Docker SSH fixture unavailable');
        ctx = await mkTestCtx({ env: { ...fixture.env, CDP_BROWSER_URL: 'http://127.0.0.1:1' } });
        // This exercise only changes the saved workspace; it never runs a model turn.
        const agent = await ctx.fns.agent.start({ model: 'mock:echo', title: 'workspace skills SSH' });
        await ctx.fns.session.save({ agent });
        active = Object.create(ctx) as Context;
        active.session = ctx.fns.session.forAgent({ agent });
        // A private TMPDIR can sit under a parent the unprivileged SSH user cannot create.
        // Seed only the matching empty directory through the disposable fixture's container root;
        // neither the host TMPDIR nor any other developer path is mounted in these containers.
        dir = mkdtempSync(join(tmpdir(), 'ws-skill-it-'));
        for (const host of ['plain', 'rg']) {
            const container = Bun.spawnSync(['docker', 'ps', '-q', '--filter', `label=com.docker.compose.project=${fixture.project}`,
                '--filter', `label=com.docker.compose.service=${host}`]);
            const id = container.stdout.toString().trim();
            expect(container.exitCode).toBe(0);
            expect(id).toMatch(/^[a-f0-9]{12,64}$/);
            const seedDir = Bun.spawnSync(['docker', 'exec', '-u', '0', id, 'install', '-d', '-m', '700', '-o', 'tester', '--', dir]);
            if (seedDir.exitCode !== 0) throw Error('cannot create the same-path test directory on ' + host + ': ' + seedDir.stderr.toString().trim());
        }
        const localConfig = JSON.stringify({ roots: { team: 'docs/skills', broken: 'other/skills' } });
        localPut('.mauzcode/skills/review/SKILL.md', manifest('review', 'Local review.'));
        localPut('docs/skills/review/SKILL.md', manifest('review', 'Local team review.'));
        localPut('other/skills/fallback/SKILL.md', manifest('fallback', 'Must never fall back.'));
        localPut('docs/skills/review/note.txt', 'local-note');
        localPut('.mauzcode/skills.json', localConfig);
        const remoteConfig = JSON.stringify({ roots: { team: 'docs/skills', broken: 'other/skills', code: 'src/skills', alias: 'runtime-alias/skills' } });
        await put('rg', '.mauzcode/skills.json', remoteConfig);
        await put('rg', '.mauzcode/skills/remote-review/SKILL.md', manifest('remote-review', 'Remote default review.'));
        await put('rg', 'docs/skills/review/SKILL.md', manifest('review', 'Remote team review.'));
        await put('rg', 'docs/skills/review/note.txt', 'remote-note');
        await put('rg', 'src/skills/code/SKILL.md', manifest('code', 'Runtime code directory.'));
        await put('rg', 'runtime-alias/skills/alias/SKILL.md', manifest('alias', 'Alias of a runtime directory.'));
        await put('rg', 'undeclared/skills/ignored/SKILL.md', manifest('ignored', 'Undeclared.'));
        await put('rg', 'other/skills/fallback/SKILL.md', manifest('fallback', 'Unreadable remote root.'));
        const q = (value: string) => ctx.fns.remote.quote({ value });
        expect((await ctx.fns.remote.exec({ host: 'rg', command: `chmod 000 -- ${q(join(dir, 'other/skills'))} && ln -s runtime-alias ${q(join(dir, 'plugins'))} && python3 -I -B -S --version` })).exitCode).toBe(0);
        await put('plain', '.mauzcode/skills.json', localConfig);
        await put('plain', '.mauzcode/skills/plain-review/SKILL.md', manifest('plain-review', 'Unsupported workspace.'));
    }, 240_000);

    afterAll(async () => {
        try {
            if (fixture && ctx && dir) {
                const q = (value: string) => ctx.fns.remote.quote({ value });
                await ctx.fns.remote.exec({ host: 'rg', command: `chmod 700 -- ${q(join(dir, 'other/skills'))} 2>/dev/null || true; rm -rf -- ${q(dir)}` });
                await ctx.fns.remote.exec({ host: 'plain', command: `rm -rf -- ${q(dir)}` });
            }
        } finally {
            await fixture?.stop();
            if (dir) rmSync(dir, { recursive: true, force: true });
        }
    }, 60_000);

    test('switching an active workspace to the same path on SSH reads different packages and no local fallback', async () => {
        const local = await switchTo('');
        expect((await scan(local)).ids).toEqual([
            'skill.workspace:review', 'skill.workspace.team:review', 'skill.workspace.broken:fallback',
        ]);
        const remote = await switchTo('rg');
        const found = await scan(remote);
        expect(found.ids).toEqual(['skill.workspace:remote-review', 'skill.workspace.team:review']);
        expect(found.packages.map(entry => entry.manifest.description)).toEqual(['Remote default review.', 'Remote team review.']);
        expect(found.diagnostics).toEqual(expect.arrayContaining([
            expect.stringContaining('root broken'), expect.stringContaining('root code'), expect.stringContaining('root alias'),
        ]));
        expect(found.diagnostics.every(note => !note.includes(dir))).toBe(true);
        const read = (workspace: { host: string; dir: string }) => active.fns.skills.workspaceSource({
            workspace, action: 'read', id: 'skill.workspace.team:review', path: 'note.txt',
        });
        expect(await read(remote)).toMatchObject({ ok: true, action: 'read', bytes: Buffer.from('remote-note') });
        expect(await active.fns.skills.workspaceSource({ workspace: remote, action: 'list', id: 'skill.workspace.team:review' }))
            .toMatchObject({ ok: true, action: 'list', resources: [{ path: 'note.txt', bytes: 11 }] });
        expect(await active.fns.skills.workspaceSource({ workspace: remote, action: 'read', id: 'skill.workspace.broken:fallback', path: 'SKILL.md' }))
            .toMatchObject({ ok: false });
        expect(await read(await switchTo(''))).toMatchObject({ ok: true, action: 'read', bytes: Buffer.from('local-note') });
    });

    test('a reachable host without Python reports unsupported and returns neither remote nor server contents', async () => {
        const python = await ctx.fns.remote.exec({ host: 'plain', command: 'command -v python3' });
        expect(python.exitCode).toBe(1);
        const workspace = await switchTo('plain');
        const result = await scan(workspace);
        expect(result.ids).toEqual([]);
        expect(result.diagnostics).toEqual(expect.arrayContaining([expect.stringContaining('require Linux with Python 3')]));
        expect(await active.fns.skills.workspaceSource({ workspace, action: 'read', id: 'skill.workspace:review', path: 'SKILL.md' }))
            .toMatchObject({ ok: false, reason: expect.stringContaining('require Linux with Python 3') });
    });
});
