import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkTestCtx } from '../_testCtx.entry';

// read_skill, its continuations and attachments, prompt discovery and local materialization.
// HOME is private so the revision cache never touches the developer's ~/.cache.
let ctx: any;
let base = '';
let dir = '';
let home = '';
let global = '';
const manifest = (name: string, description: string, body = 'Instructions.\n') => `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const as = (agent: any) => {
    const scoped = Object.create(ctx);
    scoped.session = ctx.fns.session.forAgent({ agent });
    return scoped;
};
const start = async (presetId = 'standard') => ctx.fns.agent.start({ model: 'mock:test', workspaceDir: dir, preset: await ctx.fns.agentPreset.resolve({ id: presetId }) });

beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'skill-reading-'));
    dir = join(base, 'project');
    home = join(base, 'home');
    mkdirSync(home);
    ctx = await mkTestCtx({ env: { MAUZCODE_SKILLS_DIR: join(base, 'library'), HOME: home } });
    const review = join(dir, '.mauzcode/skills/review');
    mkdirSync(join(review, 'references'), { recursive: true });
    mkdirSync(join(review, 'assets'), { recursive: true });
    writeFileSync(join(review, 'SKILL.md'), manifest('review', 'Review the diff.', 'Body ' + 'x'.repeat(70_000) + ' ünï\n'));
    writeFileSync(join(review, 'references/checklist.md'), '- check one\n');
    writeFileSync(join(review, 'assets/pixel.png'), PNG);
    writeFileSync(join(review, 'assets/blob.bin'), Buffer.from([0, 1, 2, 0, 255]));
    const located = await ctx.fns.skills.serverLibrary({ workspace: { host: '', dir } });
    global = located.globalDir;
    mkdirSync(join(global, 'check/scripts'), { recursive: true });
    writeFileSync(join(global, 'check/SKILL.md'), manifest('check', 'Run the check script.', 'Run scripts/check.sh.\n'));
    writeFileSync(join(global, 'check/scripts/check.sh'), '#!/bin/sh\necho checked\n', { mode: 0o755 });
}, 60_000);
afterAll(() => {
    if (!base) return;
    // The cache is read-only by design; restore write bits before removing the fixture.
    const unlock = (path: string) => {
        try { require('node:fs').chmodSync(path, 0o700); } catch {}
        try { if (statSync(path).isDirectory()) for (const name of readdirSync(path)) unlock(join(path, name)); } catch {}
    };
    unlock(base);
    rmSync(base, { recursive: true, force: true });
});

test('read_skill returns instructions, resources and directory, and continues long text without loss', async () => {
    const agent = await start();
    const scoped = as(agent);
    const first = await scoped.fns.skills.read({ id: 'skill.workspace:review' });
    expect(first).toMatchObject({ kind: 'skill', id: 'skill.workspace:review', name: 'review', source: 'Workspace', directory: join(dir, '.mauzcode/skills/review') });
    expect(first.resources.map((resource: any) => resource.path)).toEqual(['assets/blob.bin', 'assets/pixel.png', 'references/checklist.md']);
    expect(first.continuation).toBeString();
    // Collect every page through continuations; the concatenation equals the file exactly.
    let text = first.instructions;
    let token = first.continuation;
    while (token) {
        const page = await scoped.fns.skills.read({ id: 'skill.workspace:review', path: 'SKILL.md', continuation: token });
        expect(page.kind).toBe('text');
        text += page.text;
        token = page.continuation;
    }
    expect(text.endsWith(' ünï\n')).toBe(true);
    expect(text.length).toBe(('Body ' + 'x'.repeat(70_000) + ' ünï\n').length);

    // Native parity: the same content through the tool adapter, images as attachments, binaries by path.
    const native = await ctx.fns.tools.call({ name: 'read_skill', agent, args: { id: 'skill.workspace:review', path: 'references/checklist.md' } });
    expect(native).toMatchObject({ isError: false, output: expect.stringContaining('- check one') });
    const image = await ctx.fns.tools.call({ name: 'read_skill', agent, args: { id: 'skill.workspace:review', path: 'assets/pixel.png' } });
    expect(image.content?.[0]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(image.output).not.toContain('iVBOR');
    const blob = await scoped.fns.skills.read({ id: 'skill.workspace:review', path: 'assets/blob.bin' });
    expect(blob).toEqual({ kind: 'binary', id: 'skill.workspace:review', path: 'assets/blob.bin', revision: first.revision, bytes: 5, file: join(dir, '.mauzcode/skills/review/assets/blob.bin') });
});

test('continuations are bound to agent, path and revision', async () => {
    const agent = await start();
    const other = await start();
    const first = await as(agent).fns.skills.read({ id: 'skill.workspace:review' });
    await expect(as(other).fns.skills.read({ id: 'skill.workspace:review', path: 'SKILL.md', continuation: first.continuation })).rejects.toThrow('no longer matches');
    await expect(as(agent).fns.skills.read({ id: 'skill.workspace:review', path: 'references/checklist.md', continuation: first.continuation })).rejects.toThrow('no longer matches');
    await expect(as(agent).fns.skills.read({ id: 'skill.workspace:review', path: 'SKILL.md', continuation: '1.forged' })).rejects.toThrow('invalid continuation');
    writeFileSync(join(dir, '.mauzcode/skills/review/references/checklist.md'), '- check one\n- check two\n');
    await expect(as(agent).fns.skills.read({ id: 'skill.workspace:review', path: 'SKILL.md', continuation: first.continuation })).rejects.toThrow('no longer matches');
    await expect(as(agent).fns.skills.read({ id: 'skill.workspace:review', path: '../secret' })).rejects.toThrow();
    await expect(as(agent).fns.skills.read({ id: 'skill.workspace:review', bogus: 1 } as any)).rejects.toThrow('unknown argument');
    // Wrong agent: no session agent means no read at all.
    await expect(ctx.fns.skills.read({ id: 'skill.workspace:review' })).rejects.toThrow('trusted agent');
});

test('server packages are materialized read-only by revision on the workspace host, with executable scripts', async () => {
    const agent = await start();
    const first = await as(agent).fns.skills.read({ id: 'skill.server.global:check' });
    const cacheRoot = join(home, '.cache/mauzcode/skills/skill.server.global:check');
    expect(first.directory.startsWith(cacheRoot + '/')).toBe(true);
    const script = join(first.directory, 'scripts/check.sh');
    expect(statSync(script).mode & 0o777).toBe(0o555);
    expect(statSync(join(first.directory, 'SKILL.md')).mode & 0o777).toBe(0o444);
    expect(Bun.spawnSync([script]).stdout.toString()).toBe('checked\n');
    // Nothing is written to the repository.
    expect(existsSync(join(dir, '.cache'))).toBe(false);
    // Concurrent first reads share one revision directory and leave no staging behind.
    const results = await Promise.all([1, 2, 3, 4].map(() => ctx.fns.skills.materialize({ workspace: { host: '', dir }, id: 'skill.server.global:check' })));
    expect(new Set(results.map((result: any) => result.directory))).toEqual(new Set([first.directory]));
    expect(readdirSync(cacheRoot).filter(name => name.startsWith('.staging-'))).toEqual([]);
    // An edit produces a new revision directory; the old one is not reported as current.
    writeFileSync(join(global, 'check/scripts/check.sh'), '#!/bin/sh\necho changed\n', { mode: 0o755 });
    const second = await as(agent).fns.skills.read({ id: 'skill.server.global:check' });
    expect(second.directory).not.toBe(first.directory);
    expect(Bun.spawnSync([join(second.directory, 'scripts/check.sh')]).stdout.toString()).toBe('changed\n');
});

test('an agent without a shell gets instructions but no new execution path', async () => {
    await ctx.fns.agentPreset.create({ preset: { id: 'reader-only', name: 'Reader only', allow: ['skills.list', 'skills.read', 'tools.readSkill'] } });
    const agent = await start('reader-only');
    const wire = ctx.fns.agent.wireTools({ agent }).map((tool: any) => tool.name).sort();
    expect(wire).toEqual(['read_skill']);
    const read = await ctx.fns.tools.call({ name: 'read_skill', agent, args: { id: 'skill.server.global:check' } });
    expect(read.isError).toBe(false);
    expect((await ctx.fns.tools.call({ name: 'bash', agent, args: { command: 'true' } })).isError).toBe(true);
});

test('bootstrap is identical with zero, one and many skills; the full catalogue remains searchable', async () => {
    const empty = join(base, 'empty');
    mkdirSync(empty);
    const agent = await ctx.fns.agent.start({ model: 'mock:test', workspaceDir: empty, preset: await ctx.fns.agentPreset.resolve({ id: 'standard' }) });
    const scoped = as(agent);
    const packageDir = join(empty, '.mauzcode/skills');
    const { renameSync } = await import('node:fs');
    renameSync(join(global, 'check'), join(base, 'saved-check'));
    try {
        expect((await scoped.fns.skills.list({})).total).toBe(0);
        const bootstrap = await ctx.fns.agent.fullSystemPrompt({ agent });
        expect(bootstrap).toContain('## Agent Skills');
        expect(bootstrap).toContain('ctx.fns.skills.list');
        expect(bootstrap).toContain('read_skill');
        for (let i = 0; i < 45; i++) {
            const name = 'bulk-' + String(i).padStart(2, '0');
            mkdirSync(join(packageDir, name), { recursive: true });
            writeFileSync(join(packageDir, name, 'SKILL.md'), manifest(name, 'Distinct description ' + i));
            if (i === 0 || i === 44) {
                expect((await scoped.fns.skills.list({})).total).toBe(i + 1);
                expect(await ctx.fns.agent.fullSystemPrompt({ agent })).toBe(bootstrap);
            }
        }
        expect((await scoped.fns.skills.list({ query: 'bulk-44' })).skills.map((skill: any) => skill.id)).toEqual(['skill.workspace:bulk-44']);
    } finally {
        renameSync(join(base, 'saved-check'), join(global, 'check'));
    }
});

test('direct guidance requires a preset, both effective reader grants and an included section', async () => {
    const agent = await start();
    const section = (candidate: any, allows?: (name: string) => boolean) => ctx.fns.skills.promptSection({ agent: candidate, allows });
    expect(await section({ ...agent, preset: undefined }, () => true)).toBe('');
    for (const missing of ['skills.list', 'skills.read']) {
        const preset = structuredClone(agent.preset);
        preset.layers[0].deny.push(missing);
        expect(await section({ ...agent, preset }, () => true)).toBe('');
        expect(await section(agent, name => name !== missing)).toBe('');
    }
    const preset = structuredClone(agent.preset);
    preset.layers[0].excludeSections.push('skills');
    expect(await section({ ...agent, preset })).toBe('');
    expect(await ctx.fns.agent.fullSystemPrompt({ agent: { ...agent, preset } })).not.toContain('## Agent Skills');
});
