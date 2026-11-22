import { isAbsolute, relative, resolve } from "node:path";

type ProviderEntry = {
    kind?: string;
    name?: string;
    rel: string;
    abs: string;
    moduleDir: string;
    root?: string;
    rootDir?: string;
    mod?: { default?: types.models.ProviderDefinition };
};

/**
 * Register provider declarations from mounted sources, preserving first-owner identity across reloads.
 * Reject invalid definitions before changing the registry; core reserves the custom provider id.
 * @param opts.entries Classified modelProvider declarations, with mounted roots or trusted boot metadata.
 */
export default async function (ctx: Context, _session: Session | null, opts: { entries: ProviderEntry[] }): Promise<void> {
    const state = (ctx.state.models ??= {});
    const providers = (state.providers ??= {});
    const boot = ctx.state.procs.boot.entries ?? [];
    const mounted = ctx.fns.procs.modules.list({});
    const within = (base: string, path: string) => {
        const rel = relative(resolve(base), resolve(path));
        return rel === "" || (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel));
    };
    // Unmounting a plugin reruns boot without its files, so its declarations must
    // leave the registry now rather than at the next restart.
    const mountedNames = new Set(mounted.map(m => m.name));
    for (const [id, provider] of Object.entries(providers)) {
        if (!mountedNames.has(provider.owner)) delete providers[id];
    }
    // A full boot pass (every scanned declaration) also drops files deleted from a
    // still-mounted owner. A partial namespace reload never prunes other owners.
    const declared = boot.filter(e => e.kind === "modelProvider");
    if (declared.length && declared.every(e => opts.entries.some(o => o.abs === e.abs))) {
        const ids = new Set(opts.entries.map(e => e.name));
        for (const id of Object.keys(providers)) if (!ids.has(id)) delete providers[id];
    }
    for (const entry of opts.entries) {
        const id = entry.name;
        if (typeof id !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
            throw new Error(`${entry.rel}: modelProvider id must be lowercase kebab-case`);
        }
        const source = entry.root && entry.rootDir ? entry : boot.find(e =>
            e.kind === "modelProvider" && e.abs === entry.abs && e.name === id);
        if (!source || typeof source.root !== "string" || typeof source.rootDir !== "string" || typeof source.abs !== "string" ||
            !within(source.rootDir, source.abs) || !mounted.some(m => m.name === source.root && within(m.dir, source.rootDir))) {
            throw new Error(`${entry.rel}: modelProvider requires a mounted source owner`);
        }
        const owner = source.root;
        if (id === "custom" && owner !== "core") throw new Error(`${entry.rel}: modelProvider custom belongs to core, not ${owner}`);
        const previous = Object.hasOwn(providers, id) ? providers[id] : undefined;
        if (previous && previous.owner !== owner) throw new Error(`${entry.rel}: modelProvider ${id} already belongs to ${previous.owner}, not ${owner}`);
        const imported = entry.mod ?? await import(entry.abs + `?t=${Date.now()}`);
        const def: types.models.ProviderDefinition | undefined = imported?.default;
        const fail = (message: string): never => { throw new Error(`${entry.rel}: ${message}`); };
        if (!def || typeof def !== "object" || def.id !== id) fail("modelProvider definition id must match its filename");
        // The explicit assertion follows runtime validation; imported declarations are not trusted TS.
        const definition = def!;
        if (typeof definition.label !== "string" || !definition.label.trim()) fail("modelProvider requires a nonblank label");
        if (typeof definition.test !== "function") fail("modelProvider requires a test operation");
        for (const key of ["description", "icon"] as const) {
            if (definition[key] !== undefined && typeof definition[key] !== "string") fail(`modelProvider ${key} must be a string`);
        }
        if (!Array.isArray(definition.fields)) fail("modelProvider requires a field schema");
        const keys = new Set<string>();
        for (const field of definition.fields) {
            if (!field || typeof field.key !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(field.key) || keys.has(field.key) ||
                ["__proto__", "constructor", "prototype"].includes(field.key)) fail("modelProvider field keys must be safe and unique");
            keys.add(field.key);
            if (typeof field.label !== "string" || !field.label.trim() || !["text", "url", "select", "secret", "number", "boolean"].includes(field.type)) fail("modelProvider field requires a label and supported type");
            if (field.required !== undefined && typeof field.required !== "boolean") fail("field required must be boolean");
            for (const key of ["help", "placeholder"] as const) {
                if (field[key] !== undefined && typeof field[key] !== "string") fail(`field ${key} must be a string`);
            }
            if (field.type === "secret" && Object.hasOwn(field, "default")) fail("secret fields must not declare defaults");
            if (field.type === "select") {
                if (!Array.isArray(field.options) || !field.options.length || field.options.some(o => !o || typeof o.value !== "string" || typeof o.label !== "string") ||
                    new Set(field.options.map(o => o.value)).size !== field.options.length) fail("select field requires unique value/label options");
                if (field.default !== undefined && !field.options.some(o => o.value === field.default)) fail("select default must match an option");
            }
            if (field.default !== undefined) {
                const expected = field.type === "number" ? "number" : field.type === "boolean" ? "boolean" : "string";
                if (typeof field.default !== expected || (typeof field.default === "number" && !Number.isFinite(field.default))) fail("field default must match its type");
            }
        }
        if (!Array.isArray(definition.transports) || !definition.transports.length || definition.transports.some(t => !["direct", "socks", "ssh-tunnel"].includes(t)) ||
            new Set(definition.transports).size !== definition.transports.length) fail("modelProvider requires unique supported transports");
        for (const key of ["listModels", "usage", "validate", "stream", "route", "compact", "reasoningProfile"] as const) {
            if (definition[key] !== undefined && typeof definition[key] !== "function") fail(`modelProvider ${key} must be a function`);
        }
        if (definition.usageRefreshMs !== undefined && (!Number.isInteger(definition.usageRefreshMs) || definition.usageRefreshMs < 10000 || definition.usageRefreshMs > 3600000)) fail("modelProvider usageRefreshMs must be an integer from 10000 to 3600000");
        if (definition.stream && definition.route) fail("modelProvider declares either stream or route, not both");
        if (definition.capabilities !== undefined) {
            const caps = definition.capabilities as Record<string, unknown>;
            if (!caps || typeof caps !== "object" || Array.isArray(caps) || Object.entries(caps).some(([k, v]) => !["continuationState", "checkpoints", "reasoning", "sampling", "structuredOutput"].includes(k) || typeof v !== "boolean")) fail("modelProvider capabilities must be known boolean flags");
            if (caps.checkpoints && !definition.compact) fail("modelProvider checkpoints capability requires compact");
        }
        if (definition.actions !== undefined) {
            if (!definition.actions || typeof definition.actions !== "object" || Array.isArray(definition.actions)) fail("modelProvider actions must be a named object");
            for (const [name, action] of Object.entries(definition.actions)) {
                if (!/^[a-z][a-zA-Z0-9-]*$/.test(name) || !action || typeof action.label !== "string" || !action.label.trim() || typeof action.run !== "function") fail("modelProvider action requires a safe name, label and run operation");
            }
        }
        const { nativeWebSearch, ...ordinary } = definition;
        let native: types.models.NativeWebSearchOperation | undefined;
        if (nativeWebSearch !== undefined) {
            const binding = nativeWebSearch?.binding;
            if (typeof nativeWebSearch?.search !== 'function' || !(binding?.kind === 'key'
                ? definition.fields.some(f => f.type === 'secret' && f.key === binding.field)
                : binding?.kind === 'login' && typeof binding.current === 'function' && typeof binding.read === 'function')) {
                fail('nativeWebSearch requires a search operation and a declared key or attested login binding');
            }
            const read = nativeWebSearch.binding.kind === 'login' ? nativeWebSearch.binding.read : undefined;
            const guardedBinding = binding.kind === 'login' ? { ...binding, read: (c: Context, conn: types.models.NativeWebSearchConnection, proof: types.models.NativeWebSearchProof) => {
                if (!c.state.models?.nativeSearchConnections?.has(conn) || c.state.models.nativeSearchReads?.get(proof) !== conn) throw new Error('Inactive native search credential read');
                return read!(c, conn, proof);
            } } : { ...binding };
            native = Object.freeze({ binding: Object.freeze(guardedBinding), search: (c: Context, conn: types.models.NativeWebSearchConnection, req: Parameters<types.models.NativeWebSearchOperation['search']>[2]) => {
                if (!c.state.models?.nativeSearchCalls?.delete(conn)) throw new Error('Native search requires an authorized invocation');
                return nativeWebSearch.search(c, conn, req);
            } });
        }
        // Ordinary resolvers return only the public definition, never an executable search operation.
        providers[id] = { owner, module: entry.moduleDir === "." ? "app" : entry.moduleDir, rel: entry.rel, definition: native ? ordinary : definition, ...(native ? { native } : {}) };
        ctx.fns.procs.log.debug({ event: "load.modelProvider", msg: id, from: entry.rel });
    }
}
