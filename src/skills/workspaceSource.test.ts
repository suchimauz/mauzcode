import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testCtx } from '../$test';

let ctx: Context;
let base = '';
let dir = '';
const workspace = () => ({ host: '', dir });
const config = () => join(dir, '.mauzcode', 'skills.json');
const writeConfig = (text: string) => {
    mkdirSync(join(dir, '.mauzcode'), { recursive: true });
    writeFileSync(config(), text);
};
const pkg = (root: string, name: string, description = 'Review changes.') => {
    const path = join(dir, root, name);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\nInstructions.\n`);
    return path;
};
const scan = async () => {
    const result = await ctx.fns.skills.workspaceSource({ workspace: workspace() });
    if (!result.ok || result.action !== 'scan') throw Error('expected workspace scan');
    return { ...result, ids: result.packages.map(entry => entry.descriptor.id) };
};

beforeAll(async () => {
    ctx = await testCtx({ env: { CDP_BROWSER_URL: 'http://127.0.0.1:1' } });
    base = mkdtempSync(join(tmpdir(), 'skill-local-'));
}, 60_000);
beforeEach(() => { dir = mkdtempSync(join(base, 'project-')); });
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
afterAll(() => { if (base) rmSync(base, { recursive: true, force: true }); });

test('the documented config scans only immediate packages in default and named roots', async () => {
    const docs = readFileSync(new URL('../../docs/project-agent-skills.md', import.meta.url), 'utf8');
    const example = /## Workspace roots\n[\s\S]*?```json\n([^`]+)```/.exec(docs)?.[1];
    expect(JSON.parse(example!)).toEqual({ roots: { team: 'docs/skills' } });
    writeConfig(example!);
    pkg('.mauzcode/skills', 'review', 'Default review.');
    const team = pkg('docs/skills', 'review', 'Team review.');
    writeFileSync(join(team, 'note.txt'), 'team-only');
    pkg('docs/skills/group', 'hidden');
    pkg('unrelated/skills', 'review');

    const result = await scan();
    expect(result.ids).toEqual(['skill.workspace:review', 'skill.workspace.team:review']);
    expect(result.packages.map(entry => entry.manifest.description)).toEqual(['Default review.', 'Team review.']);
    const list = await ctx.fns.skills.workspaceSource({ workspace: workspace(), action: 'list', id: 'skill.workspace.team:review' });
    expect(list).toMatchObject({ ok: true, action: 'list', resources: [{ path: 'note.txt', bytes: 9 }] });
    const page = await ctx.fns.skills.workspaceSource({ workspace: workspace(), action: 'read', id: 'skill.workspace.team:review', path: 'note.txt', offset: 5 });
    expect(page).toMatchObject({ ok: true, action: 'read', bytes: Buffer.from('only'), offset: 5, nextOffset: 9, hasMore: false });
});

test('absent, invalid and changed config never create a file or retain named roots or plugin enablement', async () => {
    pkg('.mauzcode/skills', 'review');
    pkg('docs/skills', 'review');
    const readConfig = () => ctx.fns.skills.workspaceConfig({ workspace: workspace() });
    expect(await readConfig()).toEqual({ status: 'missing', roots: [], enabledPluginSkills: [], diagnostics: [] });
    expect((await scan()).ids).toEqual(['skill.workspace:review']);
    expect(existsSync(config())).toBe(false);

    writeConfig('{"roots":{"team":"docs/skills"},"enabledPluginSkills":["skill.plugin.git:review"]}');
    expect((await readConfig()).enabledPluginSkills).toEqual(['skill.plugin.git:review']);
    expect((await scan()).ids).toContain('skill.workspace.team:review');
    writeConfig('{"roots":{"team":"docs/skills"},"enabledPluginSkills":["skill.plugin.git:review","skill.workspace:review"]}');
    expect((await readConfig()).enabledPluginSkills).toEqual([]);
    expect((await scan()).ids).toContain('skill.workspace.team:review');
    writeConfig('{broken');
    expect(await readConfig()).toMatchObject({ status: 'invalid', roots: [], enabledPluginSkills: [] });
    expect((await scan()).ids).toEqual(['skill.workspace:review']);
    expect(await ctx.fns.skills.workspaceSource({ workspace: workspace(), action: 'read', id: 'skill.workspace.team:review', path: 'SKILL.md' })).toMatchObject({ ok: false });
    expect(readFileSync(config(), 'utf8')).toBe('{broken');
    rmSync(config());
    expect((await scan()).ids).toEqual(['skill.workspace:review']);
    expect(existsSync(config())).toBe(false);
});

test('runtime overlaps, escaping links and bad roots are isolated from healthy roots', async () => {
    pkg('.mauzcode/skills', 'review');
    pkg('docs/skills', 'review');
    pkg('src/skills', 'blocked');
    pkg('some-mount/runtime', 'mounted');
    pkg('alias-target/skills', 'aliased');
    symlinkSync('alias-target', join(dir, 'plugins'));
    symlinkSync('docs', join(dir, 'link'));
    const mounts = ctx.state.procs.modules;
    ctx.state.procs.modules = [...(mounts ?? []), { dir: join(dir, 'some-mount/runtime') } as NonNullable<typeof mounts>[number]];
    try {
        writeConfig(JSON.stringify({ roots: { team: 'docs/skills', other: '../outside', link: 'link/skills', code: 'src/skills', mount: 'some-mount', alias: 'alias-target/skills' } }));
        const result = await scan();
        expect(result.ids).toEqual(['skill.workspace:review', 'skill.workspace.team:review']);
        expect(result.diagnostics).toEqual(expect.arrayContaining([
            expect.stringContaining('root other'), expect.stringContaining('root link'), expect.stringContaining('root code'),
            expect.stringContaining('root mount'), expect.stringContaining('root alias'),
        ]));
        expect(result.diagnostics.every(note => !note.includes(dir))).toBe(true);
    } finally {
        ctx.state.procs.modules = mounts;
    }
});

test('linked and oversized config are refused without suppressing the built-in root', async () => {
    pkg('.mauzcode/skills', 'review');
    pkg('docs/skills', 'review');
    const target = join(dir, 'not-config.json');
    writeFileSync(target, '{"roots":{"team":"docs/skills"}}');
    symlinkSync(target, config());
    expect((await scan()).ids).toEqual(['skill.workspace:review']);
    expect((await ctx.fns.skills.workspaceConfig({ workspace: workspace() })).status).toBe('invalid');
    rmSync(config());
    writeConfig(' '.repeat(32_769));
    expect((await scan()).ids).toEqual(['skill.workspace:review']);
    expect((await ctx.fns.skills.workspaceConfig({ workspace: workspace() })).diagnostics).toEqual([expect.stringContaining('32768')]);
});
