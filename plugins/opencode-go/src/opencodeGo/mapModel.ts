/**
 * Map one OpenCode Go discovery entry to a ModelInfo with protocol and reasoning metadata.
 *
 * Pure mapping used by opencodeGo.listModels. Returns null for non-chat or non-tool models and entries without an id. Maps the reported API to the shared protocol (chat-completions → openai-chat, responses → openai-responses, messages → anthropic, generate-content → gemini; others leave protocol unset). Derives reasoning only from reported values: effort none → off (wire none), max → xhigh (wire max) when xhigh is absent, same-named SDK levels kept, unknown ignored; a thinking toggle adds off with disable; a reported effort default is kept when supported; no efforts and no toggle → no reasoning.
 * @param opts.raw One element of the /inference/go/v1/models data array.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** One element of the /inference/go/v1/models data array. */
        raw: unknown;
    },
): types.models.ModelInfo | null {
    const m = opts.raw as Record<string, any> | null;
        if (!m || typeof m !== "object" || typeof m.id !== "string" || !m.id || m.id.length > 200) return null;
        if (m.type !== undefined && m.type !== "chat") return null;
        if (m.capabilities?.tools?.supported !== true) return null;
        const apis: Record<string, types.models.ProtocolRoute["protocol"]> = { "chat-completions": "openai-chat", responses: "openai-responses", messages: "anthropic", "generate-content": "gemini" };
        const reported = m.api && typeof m.api === "object" ? Object.keys(m.api) : [];
        const protocol = reported.map(k => apis[k]).find(Boolean);
        const n = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
        const order: types.models.ReasoningLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
        const r = m.capabilities?.reasoning;
        let reasoning: types.models.ModelInfo["reasoning"];
        if (r?.supported === true) {
            const efforts: string[] = Array.isArray(r.effort) ? r.effort.filter((e: unknown): e is string => typeof e === "string") : [];
            const wire: Partial<Record<types.models.ReasoningLevel, string>> = {};
            const level = (e: string): types.models.ReasoningLevel | null => {
                if (e === "none") { wire.off = "none"; return "off"; }
                if (e === "max") { if (efforts.includes("xhigh")) return null; wire.xhigh = "max"; return "xhigh"; }
                return order.includes(e as types.models.ReasoningLevel) ? e as types.models.ReasoningLevel : null;
            };
            const levels = new Set(efforts.map(level).filter((l): l is types.models.ReasoningLevel => !!l));
            if (r.toggle === true) levels.add("off");
            const supported = order.filter(l => levels.has(l));
            if (supported.length) {
                const d = r.default?.type === "effort" && typeof r.default.value === "string" ? level(String(r.default.value)) : null;
                reasoning = {
                    supported,
                    ...(d && supported.includes(d) ? { default: d } : {}),
                    ...(Object.keys(wire).length ? { wire } : {}),
                    ...(r.toggle === true ? { disable: true } : {}),
                };
            }
        }
        const contextWindow = n(m.limit?.context), maxOutputTokens = n(m.limit?.output);
        return {
            id: m.id,
            ...(typeof m.name === "string" && m.name ? { label: m.name.slice(0, 200) } : {}),
            ...(typeof m.description === "string" && m.description ? { description: m.description.slice(0, 500) } : {}),
            ...(contextWindow ? { contextWindow } : {}),
            ...(maxOutputTokens ? { maxOutputTokens } : {}),
            ...(reasoning ? { reasoning } : {}),
            ...(protocol ? { protocol } : {}),
        };
}
