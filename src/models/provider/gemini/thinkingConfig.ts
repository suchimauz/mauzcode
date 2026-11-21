/**
 * Build the Code Assist thinkingConfig for one request from the SDK-resolved reasoning
 *
 * Used by the gemini provider's stream instead of the shared protocol's mapping. Gemini 2.5 models get `thinkingBudget` as a number (applied auto → -1, dynamic thinking; a level → its wire budget; off → 0). Gemini 3 models get `thinkingLevel` for a concrete level and no level for auto (model default). Every applied level except off adds `includeThoughts: true` so thought summaries stream. Without reasoning (provider opted out or unknown model) returns null and nothing is sent.
 * @param opts.model Provider-native model id.
 * @param opts.reasoning SDK-resolved reasoning of the request.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-native model id. */
        model: string;
        /** SDK-resolved reasoning of the request. */
        reasoning?: types.models.ReasoningResolution;
    },
): Record<string, unknown> | null {
    const _ctx = ctx;
    const id = opts.model.replace(/^models\//, "");
    const r = opts.reasoning;
    const budget = /^gemini-2\.5-/.test(id);
    if (!r) return budget ? { thinkingBudget: -1, includeThoughts: true } : /^gemini-3/.test(id) ? { includeThoughts: true } : null;
    if (r.applied === "off") return budget ? { thinkingBudget: 0 } : null;
    if (budget) {
        const n = r.applied === "auto" ? -1 : Number(r.wire ?? { low: 1024, medium: 8192, high: 24576 }[r.applied as "low" | "medium" | "high"]);
        return { thinkingBudget: Number.isFinite(n) ? n : -1, includeThoughts: true };
    }
    return r.applied === "auto" ? { includeThoughts: true } : { thinkingLevel: r.wire ?? r.applied, includeThoughts: true };
}
