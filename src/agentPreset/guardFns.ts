/** Builds the evaluation boundary proxy; allowed functions retain the unguarded caller context. */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Immutable creation-time rules used for every top-level call. */
        snapshot: types.agentPreset.Snapshot;
    },
): Context["fns"] {
    const allows = (name: string) => ctx.fns.agentPreset.allows({ snapshot: opts.snapshot, name });
    const discovery = new Set(["plugins.search", "plugins.read", "plugins.functions", "runtime.docs.search", "runtime.docs.get"]);
    const wrap = (node: object, path: string): object => new Proxy(node, {
        get(target, key) {
            const value = Reflect.get(target, key);
            if (typeof key !== "string") return value;
            const name = path ? `${path}.${key}` : key;
            if (typeof value === "function") return (args: Record<string, unknown> = {}) => {
                if (!allows(name)) throw new Error(`${name} is not available in preset ${opts.snapshot.name}`);
                // The original fns proxy already binds raw functions to ctx, not the eval ctx.
                return value(discovery.has(name) ? { ...args, allows } : args);
            };
            return value && typeof value === "object" ? wrap(value, name) : value;
        },
    });
    return wrap(ctx.fns, "") as Context["fns"];
}
