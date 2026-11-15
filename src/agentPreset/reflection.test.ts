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
    test('read-only facades reject writes, definitions, deletion and prototype changes', () => {
        const { registry, standard, creator, view } = fixture();
        const guarded = view(standard), other = view(creator);
        const before = registry.files.read;
        for (const node of [guarded, guarded.files, Object.getOwnPropertyDescriptor(guarded, 'files')!.value]) {
            expect(Reflect.set(node, 'read', () => 'injected')).toBe(false);
            expect(Reflect.defineProperty(node, 'read', { value: () => 'injected' })).toBe(false);
            expect(Reflect.deleteProperty(node, 'read')).toBe(false);
            expect(Reflect.setPrototypeOf(node, { injected: true })).toBe(false);
            expect(Object.getPrototypeOf(node)).toBeNull();
            expect(() => Object.defineProperty(node, 'injected', { value: true })).toThrow(TypeError);
        }
        expect(registry.files.read).toBe(before);
        expect(guarded.files.read({ path: 'safe' }).path).toBe('safe');
        expect(other.files.read({ path: 'other' }).path).toBe('other');
        expect(Object.keys(guarded.files)).toEqual(['read']);
        expect('injected' in registry).toBe(false);
    });
    test('freeze, seal and preventExtensions fail without poisoning subsequent live reflection', () => {
        const { registry, creator, view, advance } = fixture();
        const guarded = view(creator), docs = guarded.runtime.docs;
        for (const node of [guarded, docs]) {
            expect(Reflect.preventExtensions(node)).toBe(false);
            for (const freeze of [Object.freeze, Object.seal, Object.preventExtensions]) {
                expect(() => freeze(node)).toThrow(TypeError);
                expect(Object.isExtensible(node)).toBe(true);
                expect(Object.isFrozen(node)).toBe(false);
                expect(Object.isSealed(node)).toBe(false);
            }
        }
        registry.runtime = { docs: { replacement: () => 'new' } };
        advance();
        expect(Object.keys(docs)).toEqual(['replacement']);
        expect(Object.getOwnPropertyDescriptor(docs, 'replacement')!.value({})).toBe('new');
        expect(Object.isExtensible(registry)).toBe(true);
        expect(Object.isExtensible(registry.runtime.docs)).toBe(true);
    });
    test('frozen raw namespaces do not impose raw descriptor invariants on the facade', () => {
        const { registry, standard, view } = fixture();
        Object.freeze(registry.files);
        Object.defineProperty(registry.plugins, 'reload', { configurable: false, writable: false });
        Object.defineProperty(registry, 'redmine', { configurable: false, writable: false });
        const guarded = view(standard);
        expect(Object.keys(guarded.plugins).sort()).toEqual(['functions', 'read', 'search']);
        const descriptor = Object.getOwnPropertyDescriptor(guarded.files, 'read')!;
        expect(descriptor.configurable).toBe(true);
        expect(descriptor.writable).toBe(false);
        // Inspection does not invoke $main's proxy on frozen raw properties.
        expect(descriptor.value).not.toBe(registry.files.read);
    });
    test('symbols, accessors, scalar metadata and inherited properties are not capabilities', () => {
        const { registry, creator, view } = fixture();
        let accesses = 0;
        registry.odd = Object.create({ inherited: () => 'inherited' });
        Object.assign(registry.odd, { run: () => 'run', scalar: 42 });
        const symbol = Symbol('raw');
        registry.odd[symbol] = () => 'symbol';
        Object.defineProperty(registry.odd, 'accessor', { get: () => { accesses++; return registry.files; } });
        Object.defineProperty(registry.odd, 'hidden', { value: () => 'hidden' });
        const odd = view(creator).odd;
        expect(Reflect.ownKeys(odd).sort()).toEqual(['hidden', 'run']);
        expect(odd[symbol]).toBeUndefined();
        expect(odd.accessor).toBeUndefined();
        expect(odd.scalar).toBeUndefined();
        expect(odd.inherited).toBeUndefined();
        expect(accesses).toBe(0);
        expect('inherited' in odd).toBe(false);
    });
    test('retained descriptor callable and view survive full registry replacement and restore', () => {
        const { ctx, registry, creator, view } = fixture();
        const guarded = view(creator);
        const docs = Object.getOwnPropertyDescriptor(guarded.runtime, 'docs')!.value;
        const get = Object.getOwnPropertyDescriptor(docs, 'get')!.value;
        ctx.state.registry = { ...registry, runtime: { docs: { get: () => 'new root' } } };
        expect(get({})).toBe('new root');
        (ctx.state.registry as any).runtime.docs.get = {};
        expect(Object.keys(docs)).toEqual([]);
        expect(() => get({})).toThrow('runtime.docs.get is no longer available');
        ctx.state.registry = registry;
        expect(get({})).toBe('docs');
    });
    test('cyclic empty namespaces are not advertised or traversed forever', () => {
        const { registry, creator, view } = fixture();
        registry.cycle = {};
        registry.cycle.self = registry.cycle;
        expect(Object.keys(view(creator))).not.toContain('cycle');
        expect('cycle' in view(creator)).toBe(false);
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
