/**
 * Join an Antigravity fetchAvailableModels response into its provider-visible, eligible native models
 *
 * Pure. The shared first step of catalogue mapping and quota reading. Visible IDs are `agentModelSorts[].groups[].modelIds`
 * first, then `tieredModelIds`, deduplicated in provider order. An ID is eligible only when it has an entry in
 * `models`, is not `disabled` and its structured `modelProvider` is `MODEL_PROVIDER_GOOGLE` (family `gemini`) or
 * `MODEL_PROVIDER_ANTHROPIC` (family `claude`); names and labels never decide the family. Service-only, unlisted
 * and other-vendor entries are dropped. Returns only allowlisted fields, never the raw entry.
 * @param opts.response Parsed fetchAvailableModels response.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Parsed fetchAvailableModels response. */
        response: Record<string, unknown>;
    },
): { id: string; family: "gemini" | "claude"; label?: string; contextWindow?: number; maxOutputTokens?: number; thinking: boolean; remainingFraction?: number; resetAt?: number }[] {
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
    const out: ReturnType<typeof ctx.fns.models.provider.antigravity.inventory> = [];
    const seen = new Set<string>();
    for (const id of listed) {
        if (seen.has(id) || !id || id.length > 200 || !Object.hasOwn(entries, id)) continue;
        seen.add(id);
        const e = entries[id];
        if (!e || typeof e !== "object" || e.disabled === true) continue;
        const family = e.modelProvider === "MODEL_PROVIDER_GOOGLE" ? "gemini" as const : e.modelProvider === "MODEL_PROVIDER_ANTHROPIC" ? "claude" as const : null;
        if (!family) continue;
        const q = e.quotaInfo && typeof e.quotaInfo === "object" ? e.quotaInfo as { remainingFraction?: unknown; resetTime?: unknown } : {};
        // Fraction and reset are accepted independently; anything else stays unknown, never zero.
        const fraction = typeof q.remainingFraction === "number" && Number.isFinite(q.remainingFraction) && q.remainingFraction >= 0 && q.remainingFraction <= 1 ? q.remainingFraction : undefined;
        const reset = typeof q.resetTime === "string" && q.resetTime.length <= 64 ? Date.parse(q.resetTime) : NaN;
        const contextWindow = n(e.maxTokens), maxOutputTokens = n(e.maxOutputTokens);
        out.push({
            id, family,
            ...(typeof e.displayName === "string" && e.displayName.trim() ? { label: e.displayName.trim().slice(0, 200) } : {}),
            ...(contextWindow ? { contextWindow } : {}),
            ...(maxOutputTokens ? { maxOutputTokens } : {}),
            thinking: e.supportsThinking !== false,
            ...(fraction !== undefined ? { remainingFraction: fraction } : {}),
            ...(Number.isFinite(reset) && reset > 0 ? { resetAt: reset } : {}),
        });
    }
    return out;
}
