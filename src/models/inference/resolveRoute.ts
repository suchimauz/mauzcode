/**
 * Resolve a stored model route using only current storage and cached metadata
 *
 * Use through models.resolveRoute to obtain connection identity, provider inference descriptors, native compaction support, optional cached limits and the effective context limit (owner override, cached provider metadata, public catalogue via models.catalog.catalogLimits, 200000 fallback) with its source; the output limit falls back to the catalogue too. Never discovers models, reads secrets or sends provider requests, including on cold caches. A globally disabled provider fails PROVIDER_DISABLED right after parsing, before the connection lookup, winning over CONNECTION_NOT_FOUND, CONNECTION_DISABLED and MODEL_DISABLED_BY_USER. Disabled and missing routes fail with nonretryable SDK failures.
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
        // Provider switch first: no connection lookup or credential resolution for a disabled provider.
        await ctx.fns.models.inference.assertProviderEnabled({ provider: parsed.provider });
        const connections = await ctx.fns.models.connections.list({ provider: parsed.provider });
        const view = connections.find(c => c.accountName === parsed.accountName);
        if (!view) return fail("CONNECTION_NOT_FOUND", `Connection for ${opts.route} was not found; choose a model.`);
        const { definition, conn } = await ctx.fns.models.connections.resolve({ id: view.id });
        // A concurrent rename invalidates the old route rather than silently selecting its new identity.
        if (conn.accountName !== parsed.accountName) return fail("CONNECTION_NOT_FOUND", `Connection for ${opts.route} was renamed; choose a model.`);
        await ctx.fns.models.inference.assertModelEnabled({ id: conn.id, model: parsed.modelId });
        const catalogue = await ctx.fns.models.catalog.listModels({ id: conn.id, cacheOnly: true });
        const model = catalogue.models.find(m => m.id === parsed.modelId);
        // Catalogue-bound providers never resolve a route that is not a current cached choice; no discovery, no substitute.
        if (definition.capabilities?.variantCatalogue && (catalogue.source !== "provider" || !model)) return fail("MODEL_UNAVAILABLE", `Model ${opts.route} is not in the connection's current catalogue; choose a model.`);
        if (model?.reasoning?.variants && !model.reasoning.variants.members.some(m => !m.disabled)) return fail("MODEL_UNAVAILABLE", `Model ${opts.route} has no enabled variant; choose a model.`);
        const overrides = await ctx.fns.models.catalog.contextOverrides({ id: conn.id });
        // Public catalogues fill gaps only: cached models.dev snapshot, then bundled pi-ai data; never awaited from the network.
        const catalog = model?.contextWindow !== undefined && model?.maxOutputTokens !== undefined ? undefined
            : (await ctx.fns.models.catalog.catalogLimits({ provider: parsed.provider, models: [parsed.modelId] }))[parsed.modelId];
        const contextLimit = ctx.fns.models.catalog.contextLimit({ provider: model?.contextWindow ?? null, override: overrides[parsed.modelId] ?? null, catalog: catalog?.context ?? null });
        const maxOutputTokens = model?.maxOutputTokens ?? catalog?.output;
        return {
            ...parsed, route: opts.route, model: parsed.modelId, connectionId: conn.id,
            nativeCompaction: typeof definition.compact === "function",
            ...(definition.inference?.systemPreamble !== undefined ? { systemPreamble: definition.inference.systemPreamble } : {}),
            ...(definition.inference?.priceVendor !== undefined ? { priceVendor: definition.inference.priceVendor } : {}),
            ...(contextLimit.source !== "fallback" ? { contextWindow: contextLimit.effective } : {}),
            contextLimit,
            ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
        };
    } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (["PROVIDER_DISABLED", "CONNECTION_DISABLED", "MODEL_DISABLED_BY_USER", "NOT_FOUND"].includes(code)) {
            return fail(code === "NOT_FOUND" ? "CONNECTION_NOT_FOUND" : code, error instanceof Error ? error.message : code);
        }
        if (code === "UNKNOWN_PROVIDER") return fail("LEGACY_ROUTE", `Legacy model route ${opts.route}; choose a model.`);
        // Storage/programming failures retain their identity; they are not lookup failures.
        throw error;
    }
}
