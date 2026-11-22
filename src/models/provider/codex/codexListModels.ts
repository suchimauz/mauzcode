/** Fetch a complete Codex catalogue using one credential tuple. Never treat an incomplete response as removal. */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying scoped credentials and transport. */
        conn: types.models.ResolvedConnection;
        /** Internal cache publication observer: generation of credentials used for this complete response. */
        onGeneration?: (generation: string | null) => void;
    },
): Promise<types.models.ModelInfo[]> {
    const { conn } = opts;
    const auth = await ctx.fns.models.provider.codex.codexWireAuth({ conn });
    const version = await ctx.fns.models.provider.codex.codexVersion({ config: conn.config });
    const res = await ctx.fns.models.provider.codex.codexWireChecked({ conn, auth, res: await conn.fetch(
        `https://chatgpt.com/backend-api/codex/models?client_version=${encodeURIComponent(version)}`,
        { headers: { authorization: `Bearer ${auth.token}`, originator: "codex_cli_rs", ...(auth.accountId ? { "chatgpt-account-id": auth.accountId } : {}) } },
    ) });

    const invalid = () => new Error("Invalid or incomplete Codex model catalogue");
    const maxBytes = 16 * 1024 * 1024;
    const size = res.headers.get("content-length");
    if (res.status !== 200 || res.headers.has("content-range") || /rel\s*=\s*"?next\b/i.test(res.headers.get("link") ?? "") || Number(size) > maxBytes || !res.body) {
        await res.body?.cancel();
        throw invalid();
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > maxBytes) { await reader.cancel(); throw invalid(); }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    if (size !== null && !res.headers.has("content-encoding") && Number(size) !== bytes) throw invalid();
    let data;
    try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw invalid(); }
    if (!Array.isArray(data?.models) || data.models.length > 2000 || data.has_more || data.truncated || data.incomplete || data.next || data.next_cursor || data.next_page || data.next_page_token || (data.total != null && data.total !== data.models.length)) throw invalid();

    const models: types.models.ModelInfo[] = [];
    const ids = new Set<string>();
    for (const m of data.models) {
        if (typeof m?.slug !== "string" || !m.slug || m.slug.length > 200 || /[\s\x00-\x1f\x7f]/.test(m.slug) || ids.has(m.slug)) throw invalid();
        ids.add(m.slug);
        if (m.visibility === "hidden" || m.visibility === "hide" || m.supported_in_api === false) continue;
        const explicit = Object.hasOwn(m, "supported_reasoning_levels");
        const caps = explicit ? ctx.fns.models.provider.codex.codexWireDiscoveredReasoning({ m }) : ctx.fns.models.provider.codex.codexReasoningProfile({ model: m.slug });
        const tiers = new Set([...(Array.isArray(m.additional_speed_tiers) ? m.additional_speed_tiers : []), ...(Array.isArray(m.service_tiers) ? m.service_tiers.map((t: { id?: unknown } | null) => t?.id) : [])]);
        const controls: NonNullable<types.models.ModelInfo["responseControls"]> = {};
        const speeds: ("standard" | "fast" | "ultrafast")[] = ["standard"];
        if (tiers.has("priority") || tiers.has("fast")) speeds.push("fast");
        if (tiers.has("ultrafast")) speeds.push("ultrafast");
        if (speeds.length > 1) controls.speed = { supported: speeds };
        if (m.support_verbosity === true) controls.verbosity = { supported: ["low", "medium", "high"], ...(["low", "medium", "high"].includes(m.default_verbosity) ? { default: m.default_verbosity } : {}) };
        models.push({
            id: m.slug,
            ...(typeof m.display_name === "string" ? { label: m.display_name } : {}),
            ...(typeof m.description === "string" ? { description: m.description } : {}),
            ...(typeof m.context_window === "number" ? { contextWindow: m.context_window } : {}),
            ...(caps ? { reasoning: { supported: caps.supported, ...(caps.default ? { default: caps.default } : {}) } } : explicit ? { reasoningUnavailable: true } : {}),
            ...(controls.speed || controls.verbosity ? { responseControls: controls } : {}),
        });
    }
    opts.onGeneration?.(auth.generation);
    return models;
}
