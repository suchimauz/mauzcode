/**
 * Resolve a stored model route using only current storage and cached metadata
 *
 * Use through models.resolveRoute to obtain connection identity, provider inference descriptors, native compaction support and optional cached limits. Never discovers models, reads secrets or sends provider requests, including on cold caches. Disabled and missing routes fail with nonretryable SDK failures.
 * @param opts.route Exact registered provider/accountName:modelId route.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact registered provider/accountName:modelId route. */
        route: string;
    },
): Promise<types.models.ResolvedRoute> {
    const parsed = ctx.fns.models.inference.parseRoute({ route: opts.route });
    const fail = (code: string, message: string): never => {
        throw ctx.fns.models.inference.failure({ message, status: 409, info: { code, classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
    };
    try {
        const connections = await ctx.fns.models.connections.list({ provider: parsed.provider });
        const view = connections.find(c => c.accountName === parsed.accountName);
        if (!view) return fail("CONNECTION_NOT_FOUND", `Connection for ${opts.route} was not found; choose a model.`);
        const { definition, conn } = await ctx.fns.models.connections.resolve({ id: view.id });
        // A concurrent rename invalidates the old route rather than silently selecting its new identity.
        if (conn.accountName !== parsed.accountName) return fail("CONNECTION_NOT_FOUND", `Connection for ${opts.route} was renamed; choose a model.`);
        await ctx.fns.models.inference.assertModelEnabled({ id: conn.id, model: parsed.modelId });
        const catalogue = await ctx.fns.models.catalog.listModels({ id: conn.id, cacheOnly: true });
        const model = catalogue.models.find(m => m.id === parsed.modelId);
        return {
            ...parsed, route: opts.route, model: parsed.modelId, connectionId: conn.id,
            nativeCompaction: typeof definition.compact === "function",
            ...(definition.inference?.systemPreamble !== undefined ? { systemPreamble: definition.inference.systemPreamble } : {}),
            ...(definition.inference?.priceVendor !== undefined ? { priceVendor: definition.inference.priceVendor } : {}),
            ...(model?.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
            ...(model?.maxOutputTokens !== undefined ? { maxOutputTokens: model.maxOutputTokens } : {}),
        };
    } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (["CONNECTION_DISABLED", "MODEL_DISABLED_BY_USER", "NOT_FOUND"].includes(code)) {
            return fail(code === "NOT_FOUND" ? "CONNECTION_NOT_FOUND" : code, error instanceof Error ? error.message : code);
        }
        if (code === "UNKNOWN_PROVIDER") return fail("LEGACY_ROUTE", `Legacy model route ${opts.route}; choose a model.`);
        // Storage/programming failures retain their identity; they are not lookup failures.
        throw error;
    }
}
