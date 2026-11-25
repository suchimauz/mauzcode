/**
 * Map an Antigravity fetchAvailableModels response to the account's eligible Gemini models
 *
 * Pure. Keeps only IDs listed in `agentModelSorts[].groups[].modelIds` or `tieredModelIds`, present in `models`,
 * not `disabled`, containing `gemini` and not `claude` (case-insensitive), in listing order with native IDs
 * unchanged. `maxTokens` and `maxOutputTokens` become context and output limits when positive; absent limits stay
 * unspecified. Unless `supportsThinking` is false, Gemini 3 Flash models offer minimal/low/medium/high and Gemini 3
 * Pro models low/high, each sent as the same native thinkingLevel; other models offer no levels. No prices.
 * @param opts.response Parsed fetchAvailableModels response.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Parsed fetchAvailableModels response. */
        response: Record<string, unknown>;
    },
): types.models.ModelInfo[] {
    const r = opts.response as { models?: unknown; agentModelSorts?: unknown; tieredModelIds?: unknown };
    const entries = r.models && typeof r.models === "object" && !Array.isArray(r.models) ? r.models as Record<string, Record<string, unknown> | null> : {};
    const listed: string[] = [];
    for (const sort of Array.isArray(r.agentModelSorts) ? r.agentModelSorts : []) {
        for (const group of Array.isArray(sort?.groups) ? sort.groups : []) {
            for (const id of Array.isArray(group?.modelIds) ? group.modelIds : []) if (typeof id === "string") listed.push(id);
        }
    }
    if (r.tieredModelIds && typeof r.tieredModelIds === "object" && !Array.isArray(r.tieredModelIds)) {
        for (const ids of Object.values(r.tieredModelIds as Record<string, unknown>)) for (const id of Array.isArray(ids) ? ids : []) if (typeof id === "string") listed.push(id);
    }
    const n = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined;
    const out: types.models.ModelInfo[] = [];
    const seen = new Set<string>();
    for (const id of listed) {
        if (seen.has(id) || !Object.hasOwn(entries, id)) continue;
        seen.add(id);
        const e = entries[id];
        if (!e || typeof e !== "object" || e.disabled === true || !/gemini/i.test(id) || /claude/i.test(id)) continue;
        const contextWindow = n(e.maxTokens), maxOutputTokens = n(e.maxOutputTokens);
        const thinking = e.supportsThinking !== false;
        const supported: types.models.ReasoningLevel[] | null = !thinking ? null
            : /^gemini-3(?:\.\d+)?-flash/i.test(id) ? ["minimal", "low", "medium", "high"]
            : /^gemini-3(?:\.\d+)?-pro/i.test(id) ? ["low", "high"] : null;
        out.push({
            id,
            ...(typeof e.displayName === "string" && e.displayName.trim() ? { label: e.displayName.trim().slice(0, 200) } : {}),
            ...(contextWindow ? { contextWindow } : {}),
            ...(maxOutputTokens ? { maxOutputTokens } : {}),
            ...(supported ? { reasoning: { supported } } : {}),
        });
    }
    return out;
}
