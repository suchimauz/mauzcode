/**
 * Look up public USD prices per million tokens for model routes by provider price vendor
 *
 * Use to estimate spend of provider/accountName:modelId routes. Each route is resolved without network; its provider's declared inference.priceVendor selects the models.dev vendor and the exact model id is looked up there. A route that does not resolve, a provider without priceVendor, or a model absent from that vendor maps to null; prices are never borrowed from another vendor. The catalogue is fetched only when some route has a vendor.
 * @param opts.routes Exact provider/accountName:modelId routes to price.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact provider/accountName:modelId routes to price. */
        routes: string[];
    },
): Promise<Record<string, types.models.TokenPrice | null>> {
    const out: Record<string, types.models.TokenPrice | null> = {};
    const wanted: { route: string; vendor: string; model: string }[] = [];
    for (const route of opts.routes) {
        out[route] = null;
        try { const r = await ctx.fns.models.inference.resolveRoute({ route }); if (r.priceVendor) wanted.push({ route, vendor: r.priceVendor, model: r.model }); }
        catch { /* Unresolvable routes stay unpriced. */ }
    }
    if (!wanted.length) return out;
    const data = await ctx.fns.models.catalog.priceCatalog({});
    const num = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
    for (const { route, vendor, model } of wanted) {
        const cost = Object.hasOwn(data, vendor) && data[vendor]?.models && Object.hasOwn(data[vendor]!.models!, model) ? data[vendor]!.models![model]?.cost : undefined;
        const input = num(cost?.input), output = num(cost?.output);
        out[route] = input !== null && output !== null ? { input, output, cacheRead: num(cost?.cache_read), cacheWrite: num(cost?.cache_write) } : null;
    }
    return out;
}
