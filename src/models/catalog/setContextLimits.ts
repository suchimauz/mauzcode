/**
 * Set or remove owner context-window overrides for models on one connection
 *
 * Owner operation behind the Models tab context fields. `limits` maps exact provider-native model ids to a positive safe integer of tokens, or null to remove the override (reset to provider metadata, else 200,000). Only the supplied entries change: the patch is applied in one atomic UPDATE, so concurrent saves for different models never lose each other and the last successful save wins for the same model. The whole patch is validated first and rejected without writes (VALIDATION) on a malformed model id, a non-integer, zero, negative, unsafe or string value, or more than 500 entries; an unknown connection fails with NOT_FOUND. Models need not be in the current catalogue. Does not change availability, the provider models cache or updatedAt, never calls a provider, and never adds a parameter to upstream requests: the value is a local budget for compaction and context displays, not provider capacity. Emits the llm-models refresh topic and returns all stored overrides plus the effective limit of every patched model.
 * @param opts.id Connection UUID.
 * @param opts.limits Model id → tokens (positive safe integer) or null to remove; 1–500 entries.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Model id → tokens (positive safe integer) or null to remove; 1–500 entries. */
        limits: Record<string, number | null>;
    },
): Promise<{ overrides: Record<string, number>; limits: Record<string, types.models.ContextLimit> }> {
    const invalid = (message: string, field = "limits"): never => { throw Object.assign(new Error(message), { code: "VALIDATION", field, status: 400 }); };
    const limits = opts.limits;
    if (!limits || typeof limits !== "object" || Array.isArray(limits)) return invalid("limits must be an object of model id → tokens or null");
    const entries = Object.entries(limits);
    if (entries.length < 1 || entries.length > 500) return invalid("limits must contain 1–500 models");
    const set: Record<string, number> = {};
    const remove: string[] = [];
    for (const [model, value] of entries) {
        if (!/^\S{1,200}$/.test(model)) invalid("Model id must be 1–200 characters without whitespace", "model");
        if (value === null) remove.push(model);
        else if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) set[model] = value;
        else invalid(`Context limit for ${model} must be a positive whole number of tokens`);
    }
    const view = await ctx.fns.models.connections.get({ id: opts.id });
    const rows = await ctx.fns.procs.db.select({
        sql: "UPDATE llm_connections SET model_context_overrides = (COALESCE(model_context_overrides, '{}'::jsonb) || ?::jsonb) - ?::text[] WHERE id=? RETURNING id",
        params: [JSON.stringify(set), remove, view.id],
    });
    if (!rows[0]) throw Object.assign(new Error("Connection not found"), { code: "NOT_FOUND", status: 404 });
    try { await ctx.fns.procs.events.refresh({ topic: "llm-models", reason: "models-context-limits" }); } catch (error) { ctx.fns.procs.log.debug({ event: "models.refresh", msg: String(error) }); }
    const overrides = await ctx.fns.models.catalog.contextOverrides({ id: view.id });
    const catalogue = await ctx.fns.models.catalog.listModels({ id: view.id, cacheOnly: true });
    const provider = new Map(catalogue.models.map(m => [m.id, m.contextWindow ?? null]));
    const out: Record<string, types.models.ContextLimit> = {};
    for (const [model] of entries) out[model] = ctx.fns.models.catalog.contextLimit({ provider: provider.get(model) ?? null, override: overrides[model] ?? null });
    return { overrides, limits: out };
}
