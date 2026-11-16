import { describe, expect, test } from 'bun:test';
import origin from './origin';
import generation from './generation';
import compilePattern from './compilePattern';
import allows from './allows';
import defaults from './defaults';
import coreCatalogue from './coreCatalogue';
import loader from '../procs/$loader_fn';
import unload from '../procs/repl/unload';

function fixture() {
    const plugins: { name: string; namespaces: string[] }[] = [{ name: 'redmine', namespaces: ['redmine'] }, { name: 'browser', namespaces: ['browser', 'cdp', 'chrome'] }];
    const ctx: any = { state: { registry: {}, procs: { boot: { namespaceSources: { skill: { project: true, core: false }, files: { project: true, core: true } } } } }, fns: { plugins: { list: () => plugins }, procs: { log: { debug: () => {} }, project: { scan: async () => [] } }, agentPreset: {} } };
    for (const [name, fn] of Object.entries({ origin, generation, compilePattern, allows, defaults, coreCatalogue })) ctx.fns.agentPreset[name] = (opts: any) => fn(ctx, null, opts as never);
    const snapshot = (allow: string[], granted: string[] = [], deny: string[] = []): types.agentPreset.Snapshot => ({ presetId: 'test', name: 'Test', layers: [{ id: 'test', allow, plugins: granted, deny, prompt: '', excludeSections: [] }] });
    const check = (snapshot: types.agentPreset.Snapshot, name: string) => allows(ctx, null, { snapshot, name });
    return { ctx, plugins, snapshot, check };
}

describe('preset origins and patterns', () => {
    test('plugin aliases, project-only, core override and unknown core', () => {
        const { ctx } = fixture();
        for (const name of ['browser.open', 'cdp.call', 'chrome.start']) expect(origin(ctx, null, { name })).toEqual({ kind: 'plugin', plugin: 'browser' });
        expect(origin(ctx, null, { name: 'skill.run' })).toEqual({ kind: 'project' });
        expect(origin(ctx, null, { name: 'files.read' })).toEqual({ kind: 'core' });
        expect(origin(ctx, null, { name: 'future.run' })).toEqual({ kind: 'core' });
    });
    test('nested glob, escaped literals, full-name anchoring, invalid syntax', () => {
        const { ctx } = fixture();
        const pattern = (pattern: string) => compilePattern(ctx, null, { pattern });
        expect(pattern('procs.*').test('procs.dev.typecheck')).toBe(true);
        expect(pattern('procs.*').test('procs.db.select')).toBe(true);
        expect(pattern('a.$x-y_1').test('a.$x-y_1')).toBe(true);
        expect(pattern('a.b').test('axb')).toBe(false);
        expect(pattern('a.b').test('prefix.a.b')).toBe(false);
        for (const invalid of ['', 'x?', '[a]', 'x/y', ' x', 'x\\y', 'é', 'x\n']) expect(() => pattern(invalid)).toThrow('Invalid function pattern');
    });
});

describe('layer resolution', () => {
    test('allow cannot grant plugins; deny wins across origins', () => {
        const { snapshot, check } = fixture();
        const rules = snapshot(['*'], [], ['procs.*', 'skill.secret']);
        expect(check(rules, 'files.read')).toBe(true);
        expect(check(rules, 'redmine.myIssues')).toBe(false);
        expect(check(rules, 'procs.repl.load')).toBe(false);
        expect(check(rules, 'skill.run')).toBe(true);
        expect(check(rules, 'skill.secret')).toBe(false);
        expect(check(snapshot(['tools.read']), 'tools.bash')).toBe(false);
    });
    test('manual grants cover every namespace, missing plugin is harmless, denies narrow grants', () => {
        const { snapshot, check } = fixture();
        const rules = snapshot([], ['redmine', 'browser', 'missing'], ['redmine.prepare*']);
        expect(check(rules, 'redmine.myIssues')).toBe(true);
        expect(check(rules, 'redmine.prepareTimeEntry')).toBe(false);
        for (const name of ['browser.open', 'cdp.call', 'chrome.start']) expect(check(rules, name)).toBe(true);
        expect(check(rules, 'files.read')).toBe(false);
    });
    test('built-ins and parent intersection', () => {
        const { ctx, check } = fixture();
        const presets = defaults(ctx, null, {}).map(p => ({ presetId: p.id, name: p.name, layers: [{ id: p.id, allow: p.allow, deny: p.deny, plugins: p.plugins, excludeSections: p.exclude_sections, prompt: p.prompt }] }));
        const [standard, creator, minimal] = presets as [types.agentPreset.Snapshot, types.agentPreset.Snapshot, types.agentPreset.Snapshot];
        expect(standard.layers[0]!.plugins).toEqual(['openspec', 'git', 'websearch', 'browser', 'gh', 'terminal', 'glab']);
        for (const name of ['procs.repl.load', 'plugins.reload', 'settings.set', 'agentPreset.update', 'projects.create', 'projects.remove', 'projects.update', 'projects.chats', 'future.run', 'redmine.myIssues']) expect(check(standard, name)).toBe(false);
        for (const name of ['tools.read', 'agent.delegate', 'projects.list', 'projects.get', 'planning.enter', 'input.request']) expect(check(standard, name)).toBe(true);
        for (const name of ['procs.repl.load', 'future.run', 'redmine.myIssues']) expect(check(creator, name)).toBe(true);
        for (const name of ['tools.bash', 'tools.read', 'tools.write', 'tools.edit']) expect(check(minimal, name)).toBe(true);
        for (const name of ['tools.eval', 'tools.find', 'agent.delegate', 'redmine.myIssues']) expect(check(minimal, name)).toBe(false);
        expect(check({ ...creator, layers: [...standard.layers, ...creator.layers] }, 'procs.repl.load')).toBe(false);
        expect(check({ ...standard, layers: [...standard.layers, ...minimal.layers] }, 'agent.delegate')).toBe(false);
    });
    test('expanded Standard plugin grants retain denies and parent intersection', () => {
        const { ctx, plugins, check, snapshot } = fixture();
        const preset = defaults(ctx, null, {})[0]!;
        const standard = snapshot(preset.allow, preset.plugins);
        for (const plugin of ['openspec', 'git', 'websearch', 'gh', 'terminal', 'glab']) plugins.push({ name: plugin, namespaces: [plugin] });
        for (const plugin of preset.plugins) {
            const name = `${plugin}.action`;
            expect(check(standard, name)).toBe(true);
            const denied = structuredClone(standard);
            denied.layers[0]!.deny.push(name);
            expect(check(denied, name)).toBe(false);
            const restrictedParent = snapshot(['*'], preset.plugins.filter(grant => grant !== plugin));
            expect(check({ ...standard, layers: [...restrictedParent.layers, ...standard.layers] }, name)).toBe(false);
        }
        expect(check(standard, 'redmine.myIssues')).toBe(false);
        expect(preset.plugins).not.toContain('*');
    });
    test('generation invalidates warm decisions without recompiling or mutating snapshots', () => {
        const { ctx, plugins, snapshot, check } = fixture();
        const rules = snapshot(['files.*']);
        const creator = snapshot(['*'], ['*']);
        const before = JSON.stringify([rules, creator]);
        expect(check(rules, 'skill.run')).toBe(true);
        const cached = ctx.state.procs.boot.presetAccessCache.get(rules);
        const compiled = cached.layers;
        plugins.push({ name: 'new-plugin', namespaces: ['skill'] });
        expect(check(rules, 'skill.run')).toBe(false);
        expect(check(creator, 'skill.run')).toBe(true);
        expect(cached.layers).toBe(compiled);
        plugins.pop();
        expect(check(rules, 'skill.run')).toBe(true);
        ctx.state.procs.boot.namespaceSources.skill.core = true;
        expect(check(rules, 'skill.run')).toBe(false);
        expect(check(rules, 'files.newFunction')).toBe(true);
        expect(JSON.stringify([rules, creator])).toBe(before);
    });
    test('loader advances generation on registration/override and preserves host provenance; unload advances it', async () => {
        const { ctx, snapshot, check } = fixture();
        const rules = snapshot([]);
        const entry = { moduleDir: 'fresh', runtimeName: 'run', abs: '/project/.mauzcode/fresh/run.ts', rootDir: '/project/.mauzcode', rel: 'fresh/run.ts', namespace: 'fresh', fn: () => {}, source: 'export default function () {}' };
        const before = generation(ctx, null, {});
        await loader(ctx, null, { entries: [entry] });
        expect(generation(ctx, null, {})).toBeGreaterThan(before);
        expect(check(rules, 'fresh.run')).toBe(true);
        await loader(ctx, null, { entries: [{ ...entry, rootDir: '/project/src', fn: () => {} }] });
        expect(check(rules, 'fresh.run')).toBe(false);
        await loader(ctx, null, { entries: [{ ...entry, fn: () => {} }] });
        expect(check(rules, 'fresh.run')).toBe(false);
        const loaded = generation(ctx, null, {});
        expect(await unload(ctx, null, { name: 'fresh.run' })).toEqual({ removed: true, name: 'fresh.run' });
        expect(generation(ctx, null, {})).toBeGreaterThan(loaded);
    });
});
