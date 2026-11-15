/** Builds a live, read-only evaluation facade for preset-scoped discovery and dispatch.
 * Use at the agent boundary; allowed procedures retain the unguarded caller context.
 * Reflection exposes only permitted descendants, while explicit denied calls keep their diagnostic.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Immutable creation-time rules used for every top-level call. */
        snapshot: types.agentPreset.Snapshot;
    },
): Context["fns"] {
    const allows = (name: string) => ctx.fns.agentPreset.allows({ snapshot: opts.snapshot, name });
    const discovery = new Set(["plugins.search", "plugins.read", "plugins.functions", "plugins.docs", "runtime.docs.search", "runtime.docs.get", "runtime.docs.list", "canvas.kinds", "canvas.search", "canvas.promptSection", "input.kinds", "input.promptSection", "tools.list", "tools.schemas"]);
    // Resolve from the current root on every operation, never from a captured namespace.
    // Raw descriptors are used only for shape, never returned to the evaluator.
    const resolve = (path: string[]): unknown => {
        let node: unknown = ctx.state.registry;
        for (const key of path) {
            if (!node || typeof node !== "object") return undefined;
            node = Object.getOwnPropertyDescriptor(node, key)?.value;
        }
        return node;
    };
    const visible = (path: string[], ancestors = new Set<object>()): boolean => {
        const node = resolve(path);
        if (typeof node === "function") return allows(path.join("."));
        if (!node || typeof node !== "object" || ancestors.has(node)) return false;
        const seen = new Set(ancestors).add(node);
        return Object.getOwnPropertyNames(node).some(key => visible([...path, key], seen));
    };
    const valueAt = (path: string[]): unknown => {
        const value = resolve(path);
        const name = path.join(".");
        if (typeof value === "function") return (args: Record<string, unknown> = {}) => {
            if (!allows(name)) throw new Error(`${name} is not available in preset ${opts.snapshot.name}`);
            // Resolve again at invocation: retained callables must not run unloaded code.
            if (typeof resolve(path) !== "function") throw new Error(`${name} is no longer available`);
            let callable: unknown = ctx.fns;
            for (const key of path) callable = Reflect.get(callable as object, key);
            // The original injecting proxy binds the unguarded context and current session.
            return (callable as (args: Record<string, unknown>) => unknown)(discovery.has(name) ? { ...args, allows } : args);
        };
        return value && typeof value === "object" ? wrap(path) : undefined;
    };
    const wrap = (path: string[]): object => new Proxy(Object.create(null) as object, {
        get(_target, key) {
            return typeof key === "string" ? valueAt([...path, key]) : undefined;
        },
        ownKeys() {
            const node = resolve(path);
            return node && typeof node === "object"
                ? Object.getOwnPropertyNames(node).filter(key => visible([...path, key])) : [];
        },
        has(_target, key) {
            return typeof key === "string" && visible([...path, key]);
        },
        getOwnPropertyDescriptor(_target, key) {
            if (typeof key !== "string" || !visible([...path, key])) return undefined;
            return { configurable: true, enumerable: true, writable: false, value: valueAt([...path, key]) };
        },
        // An empty, extensible target permits live configurable descriptors without
        // inheriting registry invariants. Refuse freezing and all writes so it stays so.
        set: () => false,
        defineProperty: () => false,
        deleteProperty: () => false,
        setPrototypeOf: () => false,
        preventExtensions: () => false,
    });
    return wrap([]) as Context["fns"];
}
