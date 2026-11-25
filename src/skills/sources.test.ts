import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testCtx } from '../$test';

// Server library, plugin exports and the merged catalogue over real files in a private temp tree.
// The library is pinned with MAUZCODE_SKILLS_DIR; plugin mounts are injected into the module registry
// record, exactly what boot builds, so no real plugin is mounted or modified.
let ctx: Context;
let base = '';
let dir = '';
let library = '';
let plugins = '';
const manifest = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\nInstructions for ${name}.\n`;
const pkg = (parent: string, name: string, description = 'Review changes.') => {
    const path = join(parent, name);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'SKILL.md'), manifest(name, description));
    return path;
};
const plugin = (name: string, skills: unknown, label?: string) => {
    const folder = join(plugins, name);
    mkdirSync(join(folder, 'src', name), { recursive: true });
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ name, procs: { src: 'src', label, ...(skills === undefined ? {} : { skills }) } }));
    return folder;
};
const mount = (names: string[]) => {
    const base = (ctx.state.procs.modules ?? []).filter(module => !module.dir.startsWith(plugins));
    ctx.state.procs.modules = [...base, ...names.map(name => ({ name, dir: join(plugins, name), plugin: true, label: name === 'git' ? 'Git' : name.slice(0, 1).toUpperCase() + name.slice(1) }) as NonNullable<typeof ctx.state.procs.modules>[number])];
};
const workspace = () => ({ host: '', dir });
const ids = async () => (await ctx.fns.skills.catalogue({ workspace: workspace() })).entries.map(entry => entry.descriptor.id);
let mounts: typeof ctx.state.procs.modules;

beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'skill-sources-'));
    library = join(base, 'library');
    plugins = join(base, 'plugins');
    ctx = await testCtx({ env: { CDP_BROWSER_URL: 'http://127.0.0.1:1', MAUZCODE_SKILLS_DIR: library } });
    mounts = ctx.state.procs.modules;
}, 60_000);
beforeEach(() => {
    dir = mkdtempSync(join(base, 'project-'));
    mkdirSync(plugins, { recursive: true });
});
afterEach(() => {
    ctx.state.procs.modules = mounts;
    for (const path of [dir, library, plugins]) rmSync(path, { recursive: true, force: true });
});
afterAll(() => { if (base) rmSync(base, { recursive: true, force: true }); });

test('server branches are keyed by installation and project identity and never touch the workspace', async () => {
    const located = await ctx.fns.skills.serverLibrary({ workspace: workspace() });
    if (!located.ok) throw Error(located.reason);
    const identity = await ctx.fns.projects.identity({ dir, host: '' });
    expect(located.projectDir).toBe(join(library, 'projects', identity.id));
    // Same absolute path on another host is another project.
    const remote = await ctx.fns.skills.serverLibrary({ workspace: { host: 'other', dir } });
    expect(remote.ok && remote.projectDir).not.toBe(located.projectDir);
    // Missing branches are simply empty and reading creates nothing.
    expect(await ids()).toEqual([]);
    expect(() => readFileSync(library)).toThrow();

    pkg(located.globalDir, 'review', 'Global review.');
    pkg(located.projectDir, 'review', 'Project review.');
    pkg(dir + '/.mauzcode/skills', 'review', 'Workspace review.');
    expect(await ids()).toEqual(['skill.server.global:review', 'skill.server.project:review', 'skill.workspace:review']);
    const labels = (await ctx.fns.skills.catalogue({ workspace: workspace() })).entries.map(entry => entry.descriptor.sourceLabel);
    expect(labels).toEqual(['Server · global', 'Server · project', 'Workspace']);

    // A second project sees only the global branch; a fresh context (as after a restart) sees the same files.
    const other = mkdtempSync(join(base, 'other-'));
    try {
        const restarted = await testCtx({ env: { CDP_BROWSER_URL: 'http://127.0.0.1:1', MAUZCODE_SKILLS_DIR: library } });
        expect((await restarted.fns.skills.catalogue({ workspace: { host: '', dir: other } })).entries.map(entry => entry.descriptor.id)).toEqual(['skill.server.global:review']);
        expect((await restarted.fns.skills.catalogue({ workspace: workspace() })).entries.map(entry => entry.descriptor.id)).toContain('skill.server.project:review');
    } finally { rmSync(other, { recursive: true, force: true }); }

    const page = await ctx.fns.skills.serverSource({ workspace: workspace(), action: 'read', id: 'skill.server.project:review', path: 'SKILL.md' });
    expect(page.ok && page.action === 'read' && page.bytes.toString()).toContain('Project review.');
    expect(await ctx.fns.skills.serverSource({ workspace: workspace(), action: 'read', id: 'skill.workspace:review', path: 'SKILL.md' })).toMatchObject({ ok: false });
    expect(await ctx.fns.skills.serverSource({ workspace: { host: 'other', dir }, action: 'list', id: 'skill.server.project:review' })).toMatchObject({ ok: false });
});

test('a library inside a runtime source tree is refused', async () => {
    const inside = await testCtx({ env: { CDP_BROWSER_URL: 'http://127.0.0.1:1', MAUZCODE_SKILLS_DIR: join(import.meta.dir, 'library') } });
    expect(await inside.fns.skills.serverLibrary({ workspace: workspace() })).toMatchObject({ ok: false });
    const relative = await testCtx({ env: { CDP_BROWSER_URL: 'http://127.0.0.1:1', MAUZCODE_SKILLS_DIR: 'relative/library' } });
    expect(await relative.fns.skills.serverLibrary({ workspace: workspace() })).toMatchObject({ ok: false });
});

test('plugins export only explicitly declared packages, and a reload or unmount applies at once', async () => {
    const git = plugin('git', ['skills/review', 'skills/summarize'], 'Git');
    pkg(join(git, 'skills'), 'review', 'Git review.');
    pkg(join(git, 'skills'), 'summarize', 'Git summary.');
    writeFileSync(join(git, 'SKILL.md'), manifest('git', 'Plugin documentation.'));
    const checks = plugin('checks', ['review']);
    pkg(checks, 'review', 'Checks review.');
    const quiet = plugin('quiet', undefined);
    pkg(join(quiet, 'skills'), 'hidden');
    writeFileSync(join(quiet, 'SKILL.md'), manifest('quiet', 'Documentation only.'));
    mount(['git', 'checks', 'quiet']);

    const scan = await ctx.fns.skills.pluginSource({});
    if (!scan.ok || scan.action !== 'scan') throw Error('expected a plugin scan');
    expect(scan.packages.map(entry => entry.descriptor.id).sort()).toEqual(['skill.plugin.checks:review', 'skill.plugin.git:review', 'skill.plugin.git:summarize']);
    expect(scan.packages.find(entry => entry.plugin === 'git')?.descriptor.sourceLabel).toBe('Git');

    // Only exact IDs in enabledPluginSkills are enabled; the catalogue still separates both.
    mkdirSync(join(dir, '.mauzcode'), { recursive: true });
    writeFileSync(join(dir, '.mauzcode/skills.json'), JSON.stringify({ enabledPluginSkills: ['skill.plugin.git:review'] }));
    const catalogue = await ctx.fns.skills.catalogue({ workspace: workspace() });
    expect(Object.fromEntries(catalogue.entries.map(entry => [entry.descriptor.id, entry.enabled]))).toEqual({
        'skill.plugin.checks:review': false, 'skill.plugin.git:review': true, 'skill.plugin.git:summarize': false,
    });
    writeFileSync(join(dir, '.mauzcode/skills.json'), JSON.stringify({ enabledPluginSkills: ['skill.plugin.git:*'] }));
    expect((await ctx.fns.skills.catalogue({ workspace: workspace() })).entries.every(entry => !entry.enabled)).toBe(true);

    // Edit on disk, then unmount: the next read serves the new bytes, then nothing.
    writeFileSync(join(git, 'skills/review/SKILL.md'), manifest('review', 'Changed git review.'));
    const page = await ctx.fns.skills.pluginSource({ action: 'read', id: 'skill.plugin.git:review', path: 'SKILL.md' });
    expect(page.ok && page.action === 'read' && page.bytes.toString()).toContain('Changed git review.');
    mount(['checks']);
    expect(await ctx.fns.skills.pluginSource({ action: 'read', id: 'skill.plugin.git:review', path: 'SKILL.md' })).toMatchObject({ ok: false });
    expect(await ids()).toEqual(['skill.plugin.checks:review']);
});

test('a root export exposes only skill resources, and unsafe or duplicate exports are diagnosed', async () => {
    const tool = plugin('tool', ['.', '../escape', 'src/tool', 'link', 'skills/review', 'more/review', 'single']);
    writeFileSync(join(tool, 'SKILL.md'), manifest('tool', 'Root export.'));
    mkdirSync(join(tool, 'references'), { recursive: true });
    writeFileSync(join(tool, 'references/guide.md'), 'guide');
    writeFileSync(join(tool, 'src/tool/secret.ts'), 'export default 1;');
    writeFileSync(join(tool, '.env'), 'TOKEN=1');
    pkg(join(tool, 'src/tool'), 'inner');
    symlinkSync(join(tool, 'references'), join(tool, 'link'));
    // Two exported directories with the same package name claim one ID.
    pkg(join(tool, 'skills'), 'review', 'First.');
    pkg(join(tool, 'more'), 'review', 'Second.');
    pkg(tool, 'single');
    mount(['tool']);

    const list = await ctx.fns.skills.pluginSource({ action: 'list', id: 'skill.plugin.tool:tool' });
    expect(list).toMatchObject({ ok: true, action: 'list', resources: [{ path: 'references/guide.md', bytes: 5 }] });
    for (const path of ['src/tool/secret.ts', '.env', 'package.json']) {
        expect(await ctx.fns.skills.pluginSource({ action: 'read', id: 'skill.plugin.tool:tool', path })).toMatchObject({ ok: false });
    }
    const scan = await ctx.fns.skills.pluginSource({});
    if (!scan.ok || scan.action !== 'scan') throw Error('expected a plugin scan');
    expect(scan.diagnostics).toEqual(expect.arrayContaining([
        expect.stringContaining('../escape'), expect.stringContaining('src/tool overlaps runtime source'), expect.stringContaining('link must not pass through a link'),
    ]));
    const catalogue = await ctx.fns.skills.catalogue({ workspace: workspace() });
    expect(catalogue.entries.map(entry => entry.descriptor.id)).toEqual(['skill.plugin.tool:single', 'skill.plugin.tool:tool']);
    expect(catalogue.diagnostics).toContainEqual(expect.stringContaining('skill.plugin.tool:review: claimed by 2 packages'));
    expect(await ctx.fns.skills.pluginSource({ action: 'read', id: 'skill.plugin.tool:review', path: 'SKILL.md' })).toMatchObject({ ok: false, reason: expect.stringContaining('more than once') });
    expect(await ctx.fns.skills.pluginSource({ action: 'list', id: 'skill.plugin.tool:single' })).toMatchObject({ ok: true });
});

test('identical short names coexist, a duplicate ID is withheld, and one failing source keeps the others', async () => {
    const located = await ctx.fns.skills.serverLibrary({ workspace: workspace() });
    if (!located.ok) throw Error(located.reason);
    pkg(located.globalDir, 'review');
    pkg(located.projectDir, 'review');
    pkg(join(dir, '.mauzcode/skills'), 'review');
    pkg(join(dir, 'docs/skills'), 'review');
    mkdirSync(join(dir, '.mauzcode'), { recursive: true });
    writeFileSync(join(dir, '.mauzcode/skills.json'), JSON.stringify({ roots: { team: 'docs/skills', gone: 'missing/skills' } }));
    for (const name of ['git', 'checks']) pkg(plugin(name, ['review']), 'review');
    mount(['git', 'checks']);
    // The project branch is replaced by a file: that branch fails, the rest stays.
    rmSync(located.projectDir, { recursive: true });
    writeFileSync(located.projectDir, 'not a directory');

    const catalogue = await ctx.fns.skills.catalogue({ workspace: workspace() });
    expect(catalogue.entries.map(entry => entry.descriptor.id)).toEqual([
        'skill.plugin.checks:review', 'skill.plugin.git:review', 'skill.server.global:review', 'skill.workspace.team:review', 'skill.workspace:review',
    ]);
    expect(catalogue.diagnostics).toEqual(expect.arrayContaining([expect.stringContaining('server project library'), expect.stringContaining('root gone')]));

    // Metadata changes are visible on the next call; no stale header survives.
    const before = catalogue.entries.find(entry => entry.descriptor.id === 'skill.workspace:review')!.headerDigest;
    writeFileSync(join(dir, '.mauzcode/skills/review/SKILL.md'), manifest('review', 'Edited.'));
    const after = (await ctx.fns.skills.catalogue({ workspace: workspace() })).entries.find(entry => entry.descriptor.id === 'skill.workspace:review')!;
    expect(after.manifest.description).toBe('Edited.');
    expect(after.headerDigest).not.toBe(before);
});
