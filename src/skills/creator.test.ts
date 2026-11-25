import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkTestCtx } from '../_testCtx.entry';

// Built-in Creator identity and the administrative inventory.
let ctx: any;
let base = '';
let dir = '';
let library = '';
const manifest = (name: string) => `---\nname: ${name}\ndescription: ${name} skill.\n---\nSecret instructions of ${name}.\n`;
const pkg = (parent: string, name: string) => { mkdirSync(join(parent, name), { recursive: true }); writeFileSync(join(parent, name, 'SKILL.md'), manifest(name)); };
const as = (agent: any) => { const scoped = Object.create(ctx); scoped.session = ctx.fns.session.forAgent({ agent }); return scoped; };
const start = async (presetId: string) => ctx.fns.agent.start({ model: 'mock:test', workspaceDir: dir, preset: await ctx.fns.agentPreset.resolve({ id: presetId }) });

beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'skill-creator-'));
    dir = join(base, 'project');
    library = join(base, 'library');
    ctx = await mkTestCtx({ env: { MAUZCODE_SKILLS_DIR: library } });
    const folder = join(base, 'plugins/git');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'git', procs: { skills: ['skills/review', 'skills/summarize'] } }));
    pkg(join(folder, 'skills'), 'review');
    pkg(join(folder, 'skills'), 'summarize');
    ctx.state.procs.modules = [...ctx.state.procs.modules.filter((m: any) => m.name !== 'git'), { name: 'git', dir: folder, plugin: true, label: 'Git', description: '', namespaces: [], fns: [], routes: [], hooks: [], loaders: [], provides: [], clients: [], domains: [], config: {}, source: 'user', from: null, skill: null, tab: false, optional: true, place: 'right', preview: null, icon: '' }];
    mkdirSync(join(dir, '.mauzcode'), { recursive: true });
    writeFileSync(join(dir, '.mauzcode/skills.json'), JSON.stringify({ enabledPluginSkills: ['skill.plugin.git:review'] }));
    const located = await ctx.fns.skills.serverLibrary({ workspace: { host: '', dir } });
    pkg(located.projectDir, 'current');
    writeFileSync(join(located.projectDir, 'project.json'), JSON.stringify({ host: '', dir }));
    // An orphan: recorded under an SSH alias that no longer exists.
    const old = join(library, 'projects', 'p_' + 'a'.repeat(64));
    pkg(old, 'legacy');
    writeFileSync(join(old, 'project.json'), JSON.stringify({ host: 'renamed-alias', dir: '/srv/app' }));
}, 60_000);
afterAll(() => { if (base) rmSync(base, { recursive: true, force: true }); });

test('only a genuine built-in Creator chain qualifies', async () => {
    const creator = await start('creator');
    expect(await ctx.fns.skills.isCreator({ agent: creator })).toBe(true);
    expect(ctx.fns.skills.offersAuthoring({ agent: creator })).toBe(true);
    await ctx.fns.agentPreset.create({ preset: { id: 'all-access', name: 'All', allow: ['*'], plugins: ['*'] } });
    for (const preset of ['standard', 'minimal', 'all-access']) {
        const agent = await start(preset);
        expect(await ctx.fns.skills.isCreator({ agent })).toBe(false);
        expect(ctx.fns.skills.offersAuthoring({ agent })).toBe(false);
        await expect(as(agent).fns.skills.inventory({})).rejects.toThrow('only to the built-in Creator');
    }
    // Narrowed children in either direction lose authoring; a Creator child of a Creator keeps it.
    const standard = await start('standard');
    await ctx.fns.session.save({ agent: standard });
    const widened = await ctx.fns.session.fork({ id: standard.id, presetId: 'creator' });
    expect(await ctx.fns.skills.isCreator({ agent: widened })).toBe(false);
    await ctx.fns.session.save({ agent: creator });
    const narrowed = await ctx.fns.session.fork({ id: creator.id, presetId: 'standard' });
    expect(await ctx.fns.skills.isCreator({ agent: narrowed })).toBe(false);
    const child = await ctx.fns.session.fork({ id: creator.id, presetId: 'creator' });
    expect(await ctx.fns.skills.isCreator({ agent: child })).toBe(true);
    // A forged child snapshot cannot hide a non-Creator stored parent.
    const forged = { ...widened, preset: { presetId: 'creator', name: 'Creator', layers: [widened.preset.layers[1]] } };
    expect(await ctx.fns.skills.isCreator({ agent: forged })).toBe(false);
    // Direct handler calls cannot pass an identity.
    await expect(ctx.fns.skills.inventory({ agentId: creator.id } as any)).rejects.toThrow('only to the built-in Creator');
});

test('inventory lists disabled exports and orphaned branches without bodies or activation', async () => {
    const creator = await start('creator');
    const inventory = await as(creator).fns.skills.inventory({});
    expect(inventory.skills.filter((s: any) => s.id.startsWith('skill.plugin.'))).toEqual([
        { id: 'skill.plugin.git:review', name: 'review', description: 'review skill.', source: 'Git', enabled: true },
        { id: 'skill.plugin.git:summarize', name: 'summarize', description: 'summarize skill.', source: 'Git', enabled: false },
    ]);
    expect(JSON.stringify(inventory)).not.toContain('Secret instructions');
    const projects = Object.fromEntries(inventory.projects.map((p: any) => [p.projectId.slice(0, 6), p]));
    expect(projects['p_aaaa']).toMatchObject({ host: 'renamed-alias', dir: '/srv/app', orphaned: true, current: false, packages: ['legacy'] });
    expect(inventory.projects.find((p: any) => p.current)).toMatchObject({ dir, orphaned: false, packages: ['current'] });
    // Listing in the inventory does not make the disabled export readable.
    await expect(as(creator).fns.skills.read({ id: 'skill.plugin.git:summarize' })).rejects.toThrow('not available');
    expect((await as(creator).fns.skills.list({})).skills.map((s: any) => s.id)).not.toContain('skill.plugin.git:summarize');
});
