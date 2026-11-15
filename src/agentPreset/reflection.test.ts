import { describe, expect, test } from 'bun:test';
import { makeCtx } from '../$main';
import guardFns from './guardFns';
import allows from './allows';
import generation from './generation';
import origin from './origin';
import compilePattern from './compilePattern';
import defaults from './defaults';
import coreCatalogue from './coreCatalogue';

// Isolated raw registry + the real injecting proxy: descriptor reflection on a plain
// object of already-bound mocks would miss the raw-(ctx, session, opts) escape.
function fixture() {
    const ctx = makeCtx();
    const registry = ctx.state.registry as any;
    const boot = ctx.state.procs.boot as any;
    boot.namespaceSources = { local: { project: true, core: false } };
    const plugins = [
        { name: 'gh', namespaces: ['gh'] },
        { name: 'redmine', namespaces: ['redmine'] },
        { name: 'telegram', namespaces: ['telegram'] },
    ];
    const calls: string[] = [];
    registry.agentPreset = { allows, generation, origin, compilePattern, defaults, coreCatalogue };
    registry.plugins = {
        search: (_c: Context, _s: Session | null, opts: { q?: string }) => opts.q,
        read: () => 'read', functions: () => [], list: () => plugins, reload: () => 'reload',
    };
    registry.files = {
        read: (c: Context, _s: Session | null, opts: { path: string }) => {
            calls.push('files.read');
            return { path: opts.path, internal: (c.fns as any).redmine.secret({}) };
        },
    };
    registry.runtime = { docs: { get: () => 'docs', search: () => [], list: () => [] }, hidden: { run: () => 'hidden' } };
    registry.procs = { db: { select: () => [] } };
    registry.gh = { issues: () => 'issues' };
    registry.redmine = { secret: () => { calls.push('redmine.secret'); return 'internal'; }, public: () => 'public' };
    registry.telegram = { send: () => 'send' };
    registry.local = { run: () => 'local', hidden: () => 'hidden' };
    const builtins = ctx.fns.agentPreset.defaults({});
    const snapshot = (id: string): types.agentPreset.Snapshot => {
        const preset = builtins.find(p => p.id === id)!;
        return { presetId: id, name: preset.name, layers: [{ id, allow: [...preset.allow], plugins: [...preset.plugins], deny: [], prompt: '', excludeSections: [] }] };
    };
    const standard = snapshot('standard');
    const creator = snapshot('creator');
    const custom = (allow: string[], plugins: string[] = [], deny: string[] = []): types.agentPreset.Snapshot => ({
        presetId: 'custom', name: 'Custom', layers: [{ id: 'custom', allow, plugins, deny, prompt: '', excludeSections: [] }],
    });
    const view = (snapshot: types.agentPreset.Snapshot): any => guardFns(ctx, null, { snapshot });
    const advance = () => { boot.registryGeneration = (boot.registryGeneration ?? 0) + 1; };
    return { ctx, registry, boot, plugins, calls, standard, creator, custom, view, advance };
}

const enumerators: Record<string, (node: any) => PropertyKey[]> = {
    'Object.keys': node => Object.keys(node),
    'Object.entries': node => Object.entries(node).map(([key]) => key),
    'spread': node => Object.keys({ ...node }),
    'for...in': node => { const keys: string[] = []; for (const key in node) keys.push(key); return keys; },
    'Reflect.ownKeys': node => Reflect.ownKeys(node),
    'Object.getOwnPropertyNames': node => Object.getOwnPropertyNames(node),
    'Object.getOwnPropertyDescriptors': node => Object.keys(Object.getOwnPropertyDescriptors(node)),
};

describe('preset reflection: Standard and partial namespaces (1.1)', () => {
    for (const [operator, keys] of Object.entries(enumerators)) {
        test(`${operator} hides denied root, partial and nested properties`, () => {
            const { standard, view } = fixture();
            const guarded = view(standard);
            expect(keys(guarded).sort()).toEqual(['files', 'local', 'plugins', 'runtime']);
            expect(keys(guarded.plugins).sort()).toEqual(['functions', 'read', 'search']);
            expect(keys(guarded.runtime)).toEqual(['docs']);
            expect(keys(guarded.runtime.docs).sort()).toEqual(['get', 'search']);
        });
    }
    test('Object.values traverses only visible namespaces and guarded callable values', () => {
        const { standard, view } = fixture();
        const guarded = view(standard);
        expect(Object.values(guarded)).toHaveLength(4);
        expect(Object.values(guarded.plugins)).toHaveLength(3);
        expect(Object.values(guarded.runtime)).toHaveLength(1);
        expect(Object.values(guarded.runtime.docs)).toHaveLength(2);
        expect((Object.values(guarded.files)[0] as Function)({ path: 'fixture' })).toEqual({ path: 'fixture', internal: 'internal' });
    });
    for (const operator of ['in', 'Object.hasOwn', 'hasOwnProperty', 'descriptor']) {
        test(`${operator} agrees at root, partial and nested levels`, () => {
            const { standard, view } = fixture();
            const guarded = view(standard);
            const has = (node: object, key: string) => operator === 'in' ? key in node
                : operator === 'Object.hasOwn' ? Object.hasOwn(node, key)
                : operator === 'hasOwnProperty' ? Object.prototype.hasOwnProperty.call(node, key)
                : Object.getOwnPropertyDescriptor(node, key) !== undefined;
            for (const [node, allowed, denied] of [
                [guarded, 'files', 'redmine'], [guarded.plugins, 'search', 'reload'],
                [guarded.runtime, 'docs', 'hidden'], [guarded.runtime.docs, 'get', 'list'],
            ] as const) {
                expect(has(node, allowed)).toBe(true);
                expect(has(node, denied)).toBe(false);
                expect(has(node, 'nonexistent')).toBe(false);
            }
        });
    }
    test('a custom single nested grant retains ancestors, not empty siblings', () => {
        const { custom, view } = fixture();
        const guarded = view(custom(['runtime.docs.get'], [], ['local.*']));
        expect(Object.keys(guarded)).toEqual(['runtime']);
        expect(Object.keys(guarded.runtime)).toEqual(['docs']);
        expect(Object.keys(guarded.runtime.docs)).toEqual(['get']);
    });
});

describe('preset reflection: descriptors and dispatch (1.2)', () => {
    for (const plural of [false, true]) {
        const descriptor = (node: object, key: string) => plural
            ? Object.getOwnPropertyDescriptors(node)[key] : Object.getOwnPropertyDescriptor(node, key);
        test(`${plural ? 'plural' : 'single'} namespace descriptor does not expose raw registry nodes`, () => {
            const { registry, standard, view, calls } = fixture();
            const guarded = view(standard);
            const namespace = descriptor(guarded, 'plugins')!.value;
            expect(namespace).not.toBe(registry.plugins);
            expect(Object.keys(namespace).sort()).toEqual(['functions', 'read', 'search']);
            expect(() => namespace.reload({})).toThrow('plugins.reload is not available in preset Standard');
            expect(calls).toEqual([]);
        });
        test(`${plural ? 'plural' : 'single'} callable descriptor is bound and keeps its live guard`, () => {
            const { registry, boot, standard, view, calls, advance } = fixture();
            const read = descriptor(view(standard).files, 'read')!.value;
            expect(read).not.toBe(registry.files.read);
            expect(read({ path: 'descriptor' })).toEqual({ path: 'descriptor', internal: 'internal' });
            boot.namespaceSources.files = { project: false, core: true };
            // Reclassify a previously permitted core namespace as a denied plugin.
            registry.plugins.list().push({ name: 'files-plugin', namespaces: ['files'] });
            advance();
            calls.length = 0;
            expect(() => read({ path: 'denied' })).toThrow('files.read is not available in preset Standard');
            expect(calls).toEqual([]);
        });
    }
    test('explicit denied calls retain their full function-and-preset diagnostic without executing', () => {
        const { standard, view, calls } = fixture();
        expect(() => view(standard).redmine.secret({})).toThrow('redmine.secret is not available in preset Standard');
        expect(calls).toEqual([]);
    });
    test('allowed calls preserve the original context for denied internal procedures', () => {
        const { standard, view, calls } = fixture();
        expect(view(standard).files.read({ path: 'allowed' })).toEqual({ path: 'allowed', internal: 'internal' });
        expect(calls).toEqual(['files.read', 'redmine.secret']);
    });
});

describe('preset reflection: snapshot and registry lifecycle (1.3)', () => {
    test('Creator retains all live namespaces and callables', () => {
        const { creator, registry, view } = fixture();
        const guarded = view(creator);
        expect(Object.keys(guarded).sort()).toEqual(Object.keys(registry).sort());
        expect(Object.keys(guarded.runtime.docs).sort()).toEqual(['get', 'list', 'search']);
        expect(guarded.redmine.secret({})).toBe('internal');
    });
    test('project-only namespaces are implicit grants, but explicit deny wins', () => {
        const { custom, view } = fixture();
        const guarded = view(custom([], [], ['local.hidden']));
        expect(guarded.local.run({})).toBe('local');
        expect(Object.keys(guarded.local)).toEqual(['run']);
        expect(() => guarded.local.hidden({})).toThrow('local.hidden is not available in preset Custom');
    });
    test('partial plugin grants hide denied leaves and do not grant other plugins', () => {
        const { custom, view } = fixture();
        const guarded = view(custom([], ['redmine'], ['redmine.secret', 'local.*']));
        expect(Object.keys(guarded)).toEqual(['redmine']);
        expect(Object.keys(guarded.redmine)).toEqual(['public']);
        expect(guarded.redmine.public({})).toBe('public');
    });
    test('narrowed children intersect Standard parent and Creator child layers', () => {
        const { standard, creator, view } = fixture();
        const child = { ...creator, name: 'Child', layers: [...standard.layers, ...creator.layers] };
        expect(Object.keys(view(child)).sort()).toEqual(['files', 'local', 'plugins', 'runtime']);
        expect(() => view(child).redmine.secret({})).toThrow('redmine.secret is not available in preset Child');
    });
    test('two agent views do not mutate shared registries or each other’s snapshots', () => {
        const { registry, standard, creator, view } = fixture();
        const original = Object.keys(registry);
        const snapshots = JSON.stringify([standard, creator]);
        const a = view(standard), b = view(creator);
        expect(Object.keys(a.plugins).sort()).toEqual(['functions', 'read', 'search']);
        expect(Object.keys(b.plugins).sort()).toEqual(['functions', 'list', 'read', 'reload', 'search']);
        expect(Object.keys(a.plugins).sort()).toEqual(['functions', 'read', 'search']);
        expect(Object.keys(registry)).toEqual(original);
        expect(Object.keys(registry.plugins)).toContain('reload');
        expect(JSON.stringify([standard, creator])).toBe(snapshots);
    });
    test('retained nested view and callable resolve replaced registry nodes', () => {
        const { registry, creator, view, advance } = fixture();
        const guarded = view(creator), docs = guarded.runtime.docs, get = docs.get;
        expect(get({})).toBe('docs');
        registry.runtime = { docs: { get: () => 'reloaded', fresh: () => 'fresh' } };
        advance();
        expect(get({})).toBe('reloaded');
        expect(Object.keys(docs).sort()).toEqual(['fresh', 'get']);
        expect(docs.fresh({})).toBe('fresh');
    });
    test('retained view drops unloaded namespaces and does not dispatch stale callables', () => {
        const { registry, creator, view, advance } = fixture();
        const guarded = view(creator), docs = guarded.runtime.docs, get = docs.get;
        delete registry.runtime;
        advance();
        expect(Object.keys(docs)).toEqual([]);
        expect('runtime' in guarded).toBe(false);
        expect(Object.getOwnPropertyDescriptor(guarded, 'runtime')).toBeUndefined();
        expect(() => get({})).toThrow();
    });
    test('retained root observes mount and unload without rebuilding the snapshot', () => {
        const { registry, creator, view, advance } = fixture();
        const guarded = view(creator);
        expect('mounted' in guarded).toBe(false);
        registry.mounted = { run: () => 'mounted' };
        advance();
        expect(Object.keys(guarded)).toContain('mounted');
        expect(guarded.mounted.run({})).toBe('mounted');
        delete registry.mounted;
        advance();
        expect(Object.keys(guarded)).not.toContain('mounted');
    });
    test('retained namespace tracks project provenance becoming core and back', () => {
        const { ctx, boot, custom, view } = fixture();
        const snapshot = custom([]);
        const guarded = view(snapshot), local = guarded.local;
        expect(local.run({})).toBe('local');
        const first = ctx.fns.agentPreset.generation({});
        boot.namespaceSources.local = { project: true, core: true };
        expect(ctx.fns.agentPreset.generation({})).toBeGreaterThan(first);
        expect(Object.keys(local)).toEqual([]);
        expect('local' in guarded).toBe(false);
        expect(() => local.run({})).toThrow('local.run is not available in preset Custom');
        boot.namespaceSources.local = { project: true, core: false };
        expect(Object.keys(local).sort()).toEqual(['hidden', 'run']);
        expect(local.run({})).toBe('local');
    });
    test('retained views track origin changes and newly denied plugins without snapshot edits', () => {
        const { ctx, plugins, standard, view } = fixture();
        const before = JSON.stringify(standard);
        const guarded = view(standard), local = guarded.local;
        expect(Object.keys(local).sort()).toEqual(['hidden', 'run']);
        const first = ctx.fns.agentPreset.generation({});
        plugins.push({ name: 'external', namespaces: ['local'] });
        expect(ctx.fns.agentPreset.generation({})).toBeGreaterThan(first);
        expect(Object.keys(local)).toEqual([]);
        expect(Object.keys(guarded)).not.toContain('local');
        expect(() => local.run({})).toThrow('local.run is not available in preset Standard');
        plugins.pop();
        expect(Object.keys(local).sort()).toEqual(['hidden', 'run']);
        expect(Object.keys(guarded)).toContain('local');
        expect(JSON.stringify(standard)).toBe(before);
    });
});
