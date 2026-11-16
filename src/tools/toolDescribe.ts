/**
 * Native `tool_describe` adapter: documentation, input schema and return type for one function, or one plugin's workflow overview.
 *
 * Takes the agent and its preset only from the trusted tool invocation. Exact function names win over
 * plugin names. Never returns implementation source or TypeScript signatures, and strips trusted
 * internal parameters from the described schema. Denied and nonexistent names fail identically.
 * @param opts.name Exact dotted function name (`input.request`) or exact mounted plugin name (`openspec`).
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact dotted function name (`input.request`) or exact mounted plugin name (`openspec`). */
        name: string;
    },
): Promise<
    | { kind: "function"; name: string; summary: string; doc: string; parameters: Record<string, any>; returnType: string; source: string }
    | { kind: "workflow"; name: string; label: string; description: string; source: string; overview: string | null; overviewTruncated: boolean; functions: Array<{ name: string; summary: string }> }
> {
    const unknown = Object.keys(opts ?? {}).filter(key => key !== "name");
    if (unknown.length) throw new Error(`tool_describe: unknown argument ${unknown.join(", ")}`);
    const name = typeof opts.name === "string" ? opts.name.trim() : "";
    if (!name) throw new Error("tool_describe: name must be a non-empty string");
    const agent = session?.agent;
    if (!agent?.id) throw new Error("tool_describe: requires a trusted agent invocation");
    const allows = ctx.fns.agentPreset.predicate({ snapshot: agent.preset });
    const notAvailable = () => new Error(`tool_describe: "${name}" is not an available function or plugin`);

    let meta: Record<string, any> | null = null;
    try { meta = ctx.fns.runtime.docs.get({ name, allows }); } catch { meta = null; }
    if (meta) {
        const origin = ctx.fns.agentPreset.origin({ name });
        const plugin = origin.kind === "plugin" ? ctx.fns.plugins.list({}).find(p => p.name === origin.plugin) : undefined;
        return {
            kind: "function",
            name,
            summary: String(meta.summary ?? ""),
            doc: String(meta.doc ?? ""),
            parameters: stripTrusted(meta.paramsSchema),
            returnType: String(meta.returnType ?? ""),
            source: origin.kind === "plugin" ? pluginSource(plugin?.source) : origin.kind,
        };
    }

    // Only an exact plugin name; namespaces are not plugin names.
    const plugin = ctx.fns.plugins.list({}).find(p => p.name === name);
    if (!plugin) throw notAvailable();
    let read: Record<string, any>;
    try { read = await ctx.fns.plugins.read({ name, allows }); } catch { throw notAvailable(); }
    return {
        kind: "workflow",
        name,
        label: String(read.label ?? ""),
        description: String(read.description ?? ""),
        source: pluginSource(plugin.source),
        overview: read.overview?.markdown ?? null,
        overviewTruncated: Boolean(read.overview?.truncated),
        functions: (read.functions ?? []).map((fn: any) => ({ name: String(fn.name), summary: String(fn.summary ?? "") })),
    };
}

// Parameters filled by the runtime boundary, never by a model: context, session,
// agent authority, owner identity and permission predicates.
const TRUSTED = new Set(["ctx", "session", "agent", "agentId", "ownerAgentId", "owner", "runToken", "allows", "snapshot", "preset"]);

function stripTrusted(schema: any): Record<string, any> {
    const base = schema && typeof schema === "object" ? schema : { type: "object", properties: {} };
    const properties = Object.fromEntries(Object.entries<any>(base.properties ?? {})
        .filter(([key, value]) => !TRUSTED.has(key) && !/^internal\b/i.test(String(value?.description ?? ""))));
    const required = Array.isArray(base.required) ? base.required.filter((key: string) => key in properties) : undefined;
    return { ...base, properties, ...(required ? { required } : {}) };
}

function pluginSource(source: string | undefined): string {
    return source === "official" ? "official plugin" : source === "user" ? "user plugin" : `${source ?? "external"} plugin`;
}
