/**
 * Validate the model and reasoning effort of a child before it exists
 *
 * Shared by every delegation entry point (`agent.delegate`, the Goal publication path, `session.fork` callers and `sharedAgent.delegate`). Resolves the exact provider/accountName:modelId route through models.resolveRoute, re-asserts provider, connection and model availability, and checks the requested effort against the cached catalogue `reasoning.supported` (models.listModels with cacheOnly; never a provider request), which for a variant-backed group lists only the levels of members the owner has not disabled. An omitted model inherits the parent route unchanged and is re-validated when explicitly requesting max or when the inherited route is a variant-backed group and a concrete level is requested; an omitted effort means auto, which the connection normalizes for the target model and which is never inherited. Every failure names the rejected value and points at models.selectable (the `list_models` tool) so the caller can choose again; nothing is created, so a rejected delegation leaves no orphan child.
 * @param opts.model Exact provider/accountName:modelId route for the child; omitted inherits the parent's route.
 * @param opts.reasoningEffort Requested child preference; omitted means auto.
 * @param opts.parentModel Model route of the delegating agent used when no model is given.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Exact provider/accountName:modelId route requested for the child; omitted inherits the parent's route. */
        model?: string;
        /** Requested child reasoning preference; omitted means auto. */
        reasoningEffort?: types.models.ReasoningLevel | "auto";
        /** Model route of the delegating agent, used when no child model is requested. */
        parentModel?: string | null;
    } = {},
): Promise<{ model: string; reasoningEffort: types.models.ReasoningLevel | "auto" }> {
    const levels: (types.models.ReasoningLevel | "auto")[] = ["auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"];
    const effort = opts.reasoningEffort ? opts.reasoningEffort : "auto";
    if (!levels.includes(effort)) {
        throw new Error(`delegation: unsupported reasoning effort ${String(effort)}; call list_models for the levels each model supports`);
    }
    const explicit = String(opts.model ?? "").trim();
    const requested = explicit || ctx.fns.agent.requireModel({ model: opts.parentModel });
    if (!explicit && effort !== "max") {
        if (effort === "auto") return { model: requested, reasoningEffort: effort };
        // An inherited route keeps its lenient normalization, except on a variant-backed group: there a level is a
        // concrete member model, so an explicit level no eligible member backs is rejected like an explicit route.
        const variants = await (async () => {
            const inherited = await ctx.fns.models.resolveRoute({ route: requested });
            return (await ctx.fns.models.listModels({ id: inherited.connectionId, cacheOnly: true })).models.find(m => m.id === inherited.model)?.reasoning?.variants;
        })().catch(() => undefined);
        if (!variants) return { model: requested, reasoningEffort: effort };
    }
    // resolveRoute already rejects a globally disabled provider, a disabled or missing connection
    // and an owner-disabled model; route is the exact value the child stores.
    let resolved: Awaited<ReturnType<typeof ctx.fns.models.resolveRoute>>;
    try {
        resolved = await ctx.fns.models.resolveRoute({ route: requested });
    } catch (error: any) {
        throw Object.assign(new Error(`delegation: model ${requested} is not available (${String(error?.message ?? error)}); call list_models for selectable routes`), { code: error?.code, retryable: false, cause: error });
    }
    if (effort !== "auto") {
        const catalogue = await ctx.fns.models.listModels({ id: resolved.connectionId, cacheOnly: true });
        const supported = catalogue.models.find(entry => entry.id === resolved.model)?.reasoning?.supported ?? [];
        if (!supported.includes(effort as types.models.ReasoningLevel)) {
            throw new Error(`delegation: model ${resolved.route} does not support reasoning effort ${effort}; call list_models for supported levels`);
        }
    }
    return { model: resolved.route, reasoningEffort: effort };
}
