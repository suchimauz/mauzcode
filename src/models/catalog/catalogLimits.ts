/** Lazily loaded pi-ai built-in model lookup, shared across calls; null after a failed load. */
let piAi: Promise<((provider: string) => { id: string; contextWindow?: number; maxTokens?: number }[]) | null> | undefined;

/**
 * Look up public model catalogue context and output limits for one provider's models, without network waits
 *
 * Use inside models when provider metadata lacks a model's context window or output limit. Sections come from the provider's `inference.catalog` (models.dev and pi-ai lists), each defaulting to `[inference.priceVendor]`; a provider with neither gets no lookup. Tries the cached models.dev snapshot first (`limit.context`, `limit.output`; a cold snapshot starts a background fetch and is not awaited), then the bundled @earendil-works/pi-ai catalogue (`contextWindow`, `maxTokens`), matching exact model ids in section order. Catalogue failures count as missing data. Never sends provider requests.
 * @param opts.provider Registered provider id.
 * @param opts.models Exact provider-native model ids.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Registered provider id. */
        provider: string;
        /** Exact provider-native model ids to describe. @maxItems 2000 */
        models: string[];
    },
): Promise<Record<string, { context?: number; output?: number; source: "models.dev" | "pi-ai" }>> {
    const out: Record<string, { context?: number; output?: number; source: "models.dev" | "pi-ai" }> = {};
    const providers = ctx.state.models?.providers ?? {};
    const inference = Object.hasOwn(providers, opts.provider) ? providers[opts.provider]!.definition.inference : undefined;
    const vendor = inference?.priceVendor ? [inference.priceVendor] : [];
    const devSections = inference?.catalog?.modelsDev ?? vendor;
    const piSections = inference?.catalog?.piAi ?? vendor;
    const wanted = [...new Set(opts.models.filter(m => typeof m === "string" && m))];
    if (!wanted.length || (!devSections.length && !piSections.length)) return out;
    const n = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : undefined;
    const put = (id: string, context: number | undefined, output: number | undefined, source: "models.dev" | "pi-ai") => {
        if (out[id] || (context === undefined && output === undefined)) return;
        out[id] = { ...(context !== undefined ? { context } : {}), ...(output !== undefined ? { output } : {}), source };
    };
    if (devSections.length) {
        let data: Awaited<ReturnType<typeof ctx.fns.models.catalog.priceCatalog>> = {};
        try { data = await ctx.fns.models.catalog.priceCatalog({ cacheOnly: true }); } catch { data = {}; }
        for (const section of devSections) {
            const models = Object.hasOwn(data, section) ? data[section]?.models : undefined;
            if (!models) continue;
            for (const id of wanted) if (Object.hasOwn(models, id)) put(id, n(models[id]?.limit?.context), n(models[id]?.limit?.output), "models.dev");
        }
    }
    if (piSections.length && wanted.some(id => !out[id])) {
        piAi ??= import("@earendil-works/pi-ai/providers/all")
            .then(m => (provider: string) => m.getBuiltinModels(provider as Parameters<typeof m.getBuiltinModels>[0]) as { id: string; contextWindow?: number; maxTokens?: number }[])
            .catch(() => null);
        const get = await piAi;
        if (get) for (const section of piSections) {
            let list: { id: string; contextWindow?: number; maxTokens?: number }[] = [];
            try { list = get(section); } catch { list = []; }
            const byId = new Map(list.map(m => [m.id, m]));
            for (const id of wanted) { const m = byId.get(id); if (m) put(id, n(m.contextWindow), n(m.maxTokens), "pi-ai"); }
        }
    }
    return out;
}
