import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkTestCtx } from '../_testCtx.entry';

// Preset and project policy for skills.list / skills.read, exercised through real agents and
// snapshots. The library is private; a git-named plugin is injected into the module record only.
let ctx: any;
let base = '';
let dir = '';
let library = '';
let plugins = '';
const manifest = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\nInstructions for ${name}.\n`;
const pkg = (parent: string, name: string, description = name + ' skill.') => {
    mkdirSync(join(parent, name), { recursive: true });
    writeFileSync(join(parent, name, 'SKILL.md'), manifest(name, description));
};
const as = (agent: any) => {
    const scoped = Object.create(ctx);
    scoped.session = ctx.fns.session.forAgent({ agent });
    return scoped;
};
const listIds = async (agent: any) => (await as(agent).fns.skills.list({})).skills.map((skill: any) => skill.id);
const start = async (presetId: string, workspaceDir = dir) =>
    ctx.fns.agent.start({ model: 'mock:test', workspaceDir, preset: await ctx.fns.agentPreset.resolve({ id: presetId }) });

beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'skill-access-'));
    dir = join(base, 'project');
    library = join(base, 'library');
    plugins = join(base, 'plugins');
    ctx = await mkTestCtx({ env: { MAUZCODE_SKILLS_DIR: library } });
    pkg(join(dir, '.mauzcode/skills'), 'review', 'Workspace review.');
    const located = await ctx.fns.skills.serverLibrary({ workspace: { host: '', dir } });
    pkg(located.globalDir, 'style');
    pkg(located.projectDir, 'deploy');
    for (const name of ['git', 'redmine']) {
        const folder = join(plugins, name);
        mkdirSync(folder, { recursive: true });
        writeFileSync(join(folder, 'package.json'), JSON.stringify({ name, procs: { skills: ['skills/review', 'skills/summarize'] } }));
        pkg(join(folder, 'skills'), 'review');
        pkg(join(folder, 'skills'), 'summarize');
    }
    ctx.state.procs.modules = [...ctx.state.procs.modules, ...['git', 'redmine'].map(name => ({ name, dir: join(plugins, name), plugin: true, label: name, description: '', namespaces: [], fns: [], routes: [], hooks: [], loaders: [], provides: [], clients: [], domains: [], config: {}, source: 'user', from: null, skill: null, tab: false, optional: true, place: 'right', preview: null, icon: '' }))];
    writeFileSync(join(dir, '.mauzcode/skills.json'), JSON.stringify({ enabledPluginSkills: ['skill.plugin.git:review', 'skill.plugin.redmine:review'] }));
}, 60_000);
afterAll(() => { if (base) rmSync(base, { recursive: true, force: true }); });

test('Standard reads enabled skills of granted plugins only; Creator reads every enabled one; Minimal reads none', async () => {
    const standard = await start('standard');
    expect(await listIds(standard)).toEqual(['skill.plugin.git:review', 'skill.server.global:style', 'skill.server.project:deploy', 'skill.workspace:review']);
    const creator = await start('creator');
    expect(await listIds(creator)).toEqual(['skill.plugin.git:review', 'skill.plugin.redmine:review', 'skill.server.global:style', 'skill.server.project:deploy', 'skill.workspace:review']);
    const minimal = await start('minimal');
    await expect(as(minimal).fns.skills.list({})).rejects.toThrow('not available in preset');
    await expect(as(minimal).fns.skills.read({ id: 'skill.workspace:review' })).rejects.toThrow('not available');

    // Neither gate substitutes for the other, and guessed IDs fail like missing ones.
    for (const id of ['skill.plugin.redmine:review', 'skill.plugin.git:summarize', 'skill.plugin.git:missing', 'skill.workspace:missing']) {
        await expect(as(standard).fns.skills.read({ id })).rejects.toThrow(id + ' is not available');
    }
    const read = await as(standard).fns.skills.read({ id: 'skill.plugin.git:review' });
    expect(read).toMatchObject({ kind: 'skill', id: 'skill.plugin.git:review', instructions: 'Instructions for review.\n' });
});

test('custom readers, untouched old snapshots and narrowing parents', async () => {
    await ctx.fns.agentPreset.create({ preset: { id: 'skill-reader', name: 'Reader', allow: ['skills.list', 'skills.read'] } });
    const reader = await start('skill-reader');
    expect(await listIds(reader)).toEqual(['skill.server.global:style', 'skill.server.project:deploy', 'skill.workspace:review']);
    // Another project sees the global branch but not the first project's branch.
    const other = join(base, 'other');
    mkdirSync(other, { recursive: true });
    expect(await listIds(await start('skill-reader', other))).toEqual(['skill.server.global:style']);

    // A pre-upgrade Standard snapshot (persisted on insert only) keeps its old rules: no skill grant appears.
    const previous = await ctx.fns.agentPreset.resolve({ id: 'standard' });
    previous.layers[0].allow = previous.layers[0].allow.filter((pattern: string) => !pattern.startsWith('skills.'));
    const old = await ctx.fns.agent.start({ model: 'mock:test', workspaceDir: dir, preset: previous });
    const loaded = await ctx.fns.session.load({ id: old.id });
    expect(loaded.preset).toEqual(previous);
    await expect(as(loaded).fns.skills.list({})).rejects.toThrow('not available in preset');
    expect((await ctx.fns.agentPreset.get({ id: 'standard' })).allow).toContain('skills.read');

    // A Creator child of a parent without the redmine grant cannot read the redmine skill.
    const parent = await start('standard');
    const child = await ctx.fns.session.fork({ id: parent.id, presetId: 'creator' });
    expect(await listIds(child)).not.toContain('skill.plugin.redmine:review');
    await expect(as(child).fns.skills.read({ id: 'skill.plugin.redmine:review' })).rejects.toThrow('not available');
});

test('guarded calls deny skills functions for presets without grants and a wildcard export entry enables nothing', async () => {
    const minimal = await start('minimal');
    const guarded = ctx.fns.agentPreset.guardFns({ snapshot: minimal.preset });
    expect(() => guarded.skills.list({})).toThrow('not available in preset');
    writeFileSync(join(dir, '.mauzcode/skills.json'), JSON.stringify({ enabledPluginSkills: ['skill.plugin.git:*'] }));
    try {
        expect(await listIds(await start('creator'))).toEqual(['skill.server.global:style', 'skill.server.project:deploy', 'skill.workspace:review']);
    } finally {
        writeFileSync(join(dir, '.mauzcode/skills.json'), JSON.stringify({ enabledPluginSkills: ['skill.plugin.git:review', 'skill.plugin.redmine:review'] }));
    }
});

test('list pages and filters only permitted metadata', async () => {
    const standard = await start('standard');
    const scoped = as(standard);
    const first = await scoped.fns.skills.list({ limit: 2 });
    expect(first).toMatchObject({ total: 4, nextOffset: 2 });
    expect((await scoped.fns.skills.list({ offset: 2, limit: 2 })).skills.map((skill: any) => skill.id)).toEqual(['skill.server.project:deploy', 'skill.workspace:review']);
    expect((await scoped.fns.skills.list({ query: 'workspace review' })).skills).toEqual([
        { id: 'skill.workspace:review', name: 'review', description: 'Workspace review.', source: 'Workspace' },
    ]);
    expect(JSON.stringify(await scoped.fns.skills.list({}))).not.toContain('Instructions');
});
