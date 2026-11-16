/**
 * Native `tool_search` adapter: ranked, preset-scoped search over runtime functions and plugin workflows.
 *
 * Takes the agent and its preset only from the trusted tool invocation, never from arguments, and
 * filters before ranking through the shared preset predicate. Returns compact entries without source
 * code or schemas, and never activates or invokes what it finds.
 * @param opts.query Capability intent or exact function name. Must not be empty.
 * @param opts.limit Maximum entries. @default 10 @minimum 1 @maximum 30
 * @param opts.namespace Restrict results to a dotted namespace, for example `agent`.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Capability intent or exact function name. Must not be empty. */
        query: string;
        /** Maximum entries. @default 10 @minimum 1 @maximum 30 */
        limit?: number;
        /** Restrict results to a dotted namespace, for example `agent`. */
        namespace?: string;
    },
): Promise<Array<{ name: string; kind: "function" | "workflow"; summary: string; source: string }>> {
    const unknown = Object.keys(opts ?? {}).filter(key => !["query", "limit", "namespace"].includes(key));
    if (unknown.length) throw new Error(`tool_search: unknown argument ${unknown.join(", ")}`);
    const query = typeof opts.query === "string" ? opts.query.trim() : "";
    if (!query) throw new Error("tool_search: query must be a non-empty string");
    if (opts.limit !== undefined && !Number.isInteger(opts.limit)) throw new Error("tool_search: limit must be an integer");
    if (opts.namespace !== undefined && typeof opts.namespace !== "string") throw new Error("tool_search: namespace must be a string");
    const agent = session?.agent;
    if (!agent?.id) throw new Error("tool_search: requires a trusted agent invocation");
    const allows = ctx.fns.agentPreset.predicate({ snapshot: agent.preset });
    const limit = Math.max(1, Math.min(30, opts.limit ?? 10));
    const namespace = String(opts.namespace ?? "").trim().replace(/\.$/, "");

    const plugins = ctx.fns.plugins.list({});
    const [functions, workflows] = await Promise.all([
        ctx.fns.runtime.docs.search({ query, limit, namespace: namespace || undefined, allows }),
        ctx.fns.plugins.search({ query, limit, functionsPerPlugin: 1, allows }).catch(() => []),
    ]);
    const sourceOf = (name: string): string => {
        const origin = ctx.fns.agentPreset.origin({ name });
        if (origin.kind !== "plugin") return origin.kind;
        return pluginSource(plugins.find(plugin => plugin.name === origin.plugin)?.source);
    };
    // Reciprocal-rank fusion: the two lists have incomparable raw scores.
    const ranked: Array<{ entry: { name: string; kind: "function" | "workflow"; summary: string; source: string }; score: number }> = [];
    functions.forEach((hit, rank) => ranked.push({
        entry: { name: hit.name, kind: "function", summary: firstLine(hit.summary), source: sourceOf(hit.name) },
        score: 1 / (60 + rank + 1),
    }));
    workflows
        // Only plugins whose own workflow document matched; function-only boosts are already function entries.
        .filter(hit => hit.pluginEvidence)
        .filter(hit => !namespace || plugins.find(plugin => plugin.name === hit.plugin)?.namespaces.some((ns: string) => ns === namespace || ns.startsWith(namespace + ".") || namespace.startsWith(ns + ".")))
        .forEach((hit, rank) => ranked.push({
            entry: { name: hit.plugin, kind: "workflow", summary: firstLine(hit.description || hit.label || ""), source: pluginSource(plugins.find(plugin => plugin.name === hit.plugin)?.source) },
            score: 1 / (60 + rank + 1),
        }));
    return ranked
        .sort((a, b) => b.score - a.score || (a.entry.kind === b.entry.kind ? a.entry.name.localeCompare(b.entry.name) : a.entry.kind === "function" ? -1 : 1))
        .slice(0, limit)
        .map(item => item.entry);
}

function pluginSource(source: string | undefined): string {
    return source === "official" ? "official plugin" : source === "user" ? "user plugin" : `${source ?? "external"} plugin`;
}

function firstLine(text: unknown): string {
    return String(text ?? "").split("\n").map(line => line.trim()).find(Boolean)?.slice(0, 200) ?? "";
}
