/**
 * List a connection's models from its persistent cache, refreshing from the provider on demand
 *
 * Cache-only reads never resolve credentials. Codex publication is fenced by the issuing account
 * generation and refresh start order. Only a winning publication reconciles chat preferences.
 * @param opts.id Connection UUID.
 * @param opts.refresh Ask the provider now and update the cache.
 * @param opts.cacheOnly Read cache or manual ids only, including on a cold cache.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Ask the provider now and update the cache. */
        refresh?: boolean;
        /** Never resolve credentials or call a provider. @default false */
        cacheOnly?: boolean;
    },
): Promise<{ models: types.models.ModelInfo[]; source: "provider" | "manual"; cachedAt: number | null; error?: string }> {
    type Model = types.models.ModelInfo;
    const view = await ctx.fns.models.connections.get({ id: opts.id });
    const codex = view.provider === "codex";
    const off = new Set(view.disabledModels);
    const mark = (models: Model[]) => models.map(m => ({ ...m, disabled: off.has(m.id) }));
    const manual = (Array.isArray(view.config.models) ? view.config.models : []).filter((m): m is string => typeof m === "string" && !!m).map(id => ({ id }));
    const sanitize = (raw: Model[], legacy = false): Model[] => {
        const ids = new Set<string>();
        const models: Model[] = [];
        for (const m of raw.slice(0, 2000)) {
            if (!m || typeof m.id !== "string" || !m.id || m.id.length > 200 || ids.has(m.id)) continue;
            ids.add(m.id);
            const n = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
            const contextWindow = n(m.contextWindow), maxOutputTokens = n(m.maxOutputTokens);
            const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
            const r = m.reasoning;
            const ok = !!r && Array.isArray(r.supported) && r.supported.length > 0 && r.supported.every(l => levels.includes(l)) && new Set(r.supported).size === r.supported.length && (r.default === undefined || r.supported.includes(r.default));
            const wire = ok && r.wire && typeof r.wire === "object" && !Array.isArray(r.wire)
                ? Object.fromEntries(Object.entries(r.wire).filter(([l, v]) => r.supported.includes(l as types.models.ReasoningLevel) && typeof v === "string" && v.length > 0 && v.length <= 40)) : undefined;
            const reasoning = ok ? { supported: [...r.supported], ...(r.default !== undefined ? { default: r.default } : {}),
                ...(wire && Object.keys(wire).length ? { wire } : {}), ...(r.disable === true ? { disable: true } : {}),
                ...(r.adaptive === true ? { adaptive: true } : {}), ...(r.effort === false ? { effort: false } : {}) } : undefined;
            const choices = <T extends string>(raw: unknown, allowed: readonly T[]): T[] => Array.isArray(raw)
                ? [...new Set(raw.filter((v): v is T => allowed.includes(v)))] : [];
            const speed = choices(m.responseControls?.speed?.supported, ["standard", "fast", "ultrafast"] as const);
            const verbosity = choices(m.responseControls?.verbosity?.supported, ["low", "medium", "high"] as const);
            const v = m.responseControls?.verbosity?.default;
            const responseControls = !legacy && (speed.length || verbosity.length) ? {
                ...(speed.length ? { speed: { supported: speed } } : {}),
                ...(verbosity.length ? { verbosity: { supported: verbosity, ...(v && verbosity.includes(v) ? { default: v } : {}) } } : {}),
            } : undefined;
            const protocol = m.protocol && ["openai-chat", "openai-responses", "anthropic", "gemini"].includes(m.protocol) ? m.protocol : undefined;
            models.push({ id: m.id, ...(responseControls ? { responseControls } : {}), ...(m.reasoningUnavailable === true ? { reasoningUnavailable: true } : reasoning ? { reasoning } : {}),
                ...(protocol ? { protocol } : {}), ...(typeof m.label === "string" ? { label: m.label.slice(0, 200) } : {}), ...(typeof m.description === "string" ? { description: m.description.slice(0, 500) } : {}),
                ...(contextWindow ? { contextWindow } : {}), ...(maxOutputTokens ? { maxOutputTokens } : {}) });
        }
        return models;
    };
    type Row = { models_cache: Model[] | null; models_cached_at: string | null; codex_generation: string | null; models_cache_generation: string | null; published: string };
    const read = async (lock = false) => (await ctx.fns.procs.db.select({ sql: `SELECT models_cache,models_cached_at,codex_generation,models_cache_generation,models_published_ticket::text AS published FROM llm_connections WHERE id=?${lock ? " FOR UPDATE" : ""}`, params: [view.id] }) as Row[])[0];
    const current = (row?: Row, allowLegacy = false, error?: string) => {
        const trusted = !codex || (!!row?.codex_generation && row.models_cache_generation === row.codex_generation);
        const legacy = allowLegacy && row?.models_cache_generation == null && row?.published === "0";
        const cache = row && (trusted || legacy) && Array.isArray(row.models_cache) ? sanitize(row.models_cache, !trusted) : null;
        return { models: mark(cache ?? manual), source: cache ? "provider" as const : "manual" as const, cachedAt: cache && row?.models_cached_at != null ? Number(row.models_cached_at) : null, ...(error ? { error } : {}) };
    };
    const def = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider) ? ctx.state.models!.providers![view.provider]!.definition : undefined;
    const disabled = !view.enabled || !def?.listModels || (!opts.cacheOnly && (await ctx.fns.models.disabledProviders({})).has(view.provider));
    const initial = current(await read(), true);
    if (opts.cacheOnly || disabled || (initial.source === "provider" && !opts.refresh)) return initial;
    const seen: string[] = [];
    try {
        const [start] = codex ? await ctx.fns.procs.db.select({ sql: `UPDATE llm_connections SET models_refresh_ticket=models_refresh_ticket+1 WHERE id=? RETURNING models_refresh_ticket::text AS ticket,codex_generation AS generation`, params: [view.id] }) as { ticket: string; generation: string | null }[] : [];
        const { definition, conn } = await ctx.fns.models.connections.resolve({ id: view.id });
        const secret = conn.secret;
        conn.secret = async (key: string) => { const value = await secret(key); if (value) seen.push(value); return value; };
        let issued: string | null = null;
        const raw = codex ? await ctx.fns.models.provider.codex.codexListModels({ conn, onGeneration: g => { issued = g; } }) : await definition.listModels!(ctx, conn);
        if (!Array.isArray(raw) || (codex && (raw.length > 2000 || raw.some(m => !m || typeof m.id !== "string" || !m.id.trim() || m.id.length > 200)))) throw new Error("Provider returned an invalid model list");
        const models = sanitize(raw);
        const now = Date.now();
        if (codex) return await ctx.fns.procs.db.transaction({ fn: async () => {
            const row = await read(true);
            if (!issued || !row || row.codex_generation !== issued || !start || start.generation !== issued) return current(row, false, "Account binding changed or unavailable");
            if (BigInt(row.published) >= BigInt(start.ticket)) return current(row);
            await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET models_cache=?::jsonb,models_cached_at=?,models_cache_generation=?,models_published_ticket=? WHERE id=?", params: [JSON.stringify(models), now, issued, start.ticket, view.id] });
            await ctx.fns.session.reconcileCodexControls({ connectionId: view.id, generation: issued, models });
            return { models: mark(models), source: "provider" as const, cachedAt: now };
        } }) as ReturnType<typeof current>;
        await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET models_cache=?::jsonb, models_cached_at=? WHERE id=?", params: [JSON.stringify(models), now, view.id] });
        return { models: mark(models), source: "provider", cachedAt: now };
    } catch (error) {
        return current(await read(), false, ctx.fns.models.connections.safeMessage({ message: error, secrets: seen, fallback: "Model discovery failed" }));
    }
}
