/**
 * Resolve human-readable display names for model routes
 *
 * Use inside models to name provider/accountName:modelId routes for UI pickers, chat lists and headers; display only, never for routing. Order: an explicit or cached connection catalogue label (cache-only, no provider network); else the exact model id in the cached models.dev snapshot (models.catalog.priceCatalog), trying the provider's inference.priceVendor, the id's own vendor/ prefix, well-known vendors, then every vendor, with trailing (latest)/(preview) removed and a name equal to the bare id ignored; else a prettified id (claude-opus-4-5 → Claude Opus 4.5, gpt-5.1-codex-mini → GPT-5.1 Codex Mini). A leading ssh/<host>: prefix is ignored, so the same model on any host gets the same name. Unparseable routes are named from their suffix. Never throws for unknown or unavailable routes.
 * @param opts.routes Model routes provider/accountName:modelId (or bare ids) to name; every input appears as a key in the result.
 * @param opts.offline Read local label snapshots only; never hydrate models.dev.
 * @param opts.labels Complete catalogue labels by route, supplied by a caller that already read the catalogues; when present the connection cache is not read.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model routes provider/accountName:modelId (or bare ids) to name; every input appears as a key in the result. */
        routes: string[];
        /** Complete catalogue labels by route, supplied by a caller that already read the catalogues; when present the connection cache is not read. */
        labels?: Record<string, string>;
        /** Never start external catalogue hydration, even on a cold cache. */
        offline?: boolean;
    },
): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
        if (!opts.routes.length) return out;
        const upper: Record<string, string> = { gpt: "GPT", glm: "GLM", ai: "AI", oss: "OSS", kimi: "Kimi", o1: "o1", o3: "o3", o4: "o4" };
        const pretty = (id: string) => id.replace(/(\d)-(?=\d(?:\D|$))/g, "$1.").split(/[-_]+/).filter(Boolean)
            .map(w => upper[w.toLowerCase()] ?? (/^\d/.test(w) ? w : w[0]!.toUpperCase() + w.slice(1))).join(" ")
            .replace(/^(GPT|GLM) (\d)/, "$1-$2");
        const clean = (n: string) => n.replace(/\s*\((latest|preview)\)\s*$/i, "").trim();
        const parse = (raw: string) => {
            // Persisted ssh/<host>: prefixes name the same model; the host never changes the display name.
            const route = raw.replace(/^ssh\/[^:]+:/, "");
            const slash = route.indexOf("/"), colon = route.indexOf(":", slash + 1);
            if (slash <= 0 || colon <= slash) return { provider: "", account: "", id: route.slice(route.lastIndexOf(":") + 1) };
            return { provider: route.slice(0, slash), account: route.slice(slash + 1, colon), id: route.slice(colon + 1) };
        };
        // Labels from cached connection catalogues; never touches the network.
        const labels = new Map<string, string>(Object.entries(opts.labels ?? {}).filter(([, v]) => typeof v === "string" && v.trim()));
        const missing = opts.labels ? [] : opts.routes.filter(r => !labels.has(r) && parse(r).provider);
        if (missing.length) {
            const connections = await ctx.fns.models.connections.list({}).catch(() => [] as types.models.ConnectionView[]);
            const wanted = new Set(missing.map(r => { const p = parse(r); return p.provider + "/" + p.account; }));
            await Promise.all(connections.filter(c => wanted.has(c.provider + "/" + c.accountName)).map(async c => {
                try {
                    const list = await ctx.fns.models.catalog.listModels({ id: c.id, cacheOnly: true });
                    for (const m of list.models) if (m.label?.trim()) labels.set(c.provider + "/" + c.accountName + ":" + m.id, m.label.trim());
                } catch { /* Unavailable catalogue: fall through to models.dev and prettify. */ }
            }));
        }
        const labelOf = (route: string) => labels.get(route) ?? labels.get(route.replace(/^ssh\/[^:]+:/, ""));
        const pending = opts.routes.filter(r => !labelOf(r));
        let data: Awaited<ReturnType<Context["fns"]["models"]["catalog"]["priceCatalog"]>> = {};
        if (pending.length) data = await ctx.fns.models.catalog.priceCatalog({ offline: opts.offline }).catch(() => ({}));
        const has = (o: object | undefined, k: string) => !!o && Object.hasOwn(o, k);
        const nameIn = (vendor: string, id: string) => has(data, vendor) && has(data[vendor]?.models, id) ? data[vendor]!.models![id]?.name : undefined;
        const known = ["anthropic", "openai", "google", "xai", "mistral", "deepseek", "alibaba", "meta", "moonshotai", "zai"];
        for (const route of opts.routes) {
            const label = labelOf(route);
            if (label) { out[route] = label; continue; }
            const { provider, id } = parse(route);
            const bare = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
            const vendor = provider ? ctx.state.models?.providers?.[provider]?.definition.inference?.priceVendor : undefined;
            const vendors = [...(vendor ? [vendor] : []), ...(id.includes("/") ? [id.slice(0, id.indexOf("/"))] : []), ...known, ...Object.keys(data)];
            let name: string | undefined;
            for (const v of vendors) { name = nameIn(v, id) ?? nameIn(v, bare); if (typeof name === "string" && name.trim() && name.trim().toLowerCase() !== bare.toLowerCase()) break; name = undefined; }
            out[route] = name ? clean(name) : bare ? pretty(bare) : route;
        }
        return out;
}
