/**
 * Return the versioned Gemini Code Assist reasoning profile for a model
 *
 * SDK profile gemini-code-assist-2026-05 using only SDK levels and no default level, so an omitted or auto preference applies `auto`. Gemini 3 models take thinking levels: `low` and `high` (plus `medium` for flash), with the level name as the wire value (sent as thinkingConfig.thinkingLevel). Gemini 2.5 models take thinking budgets: `low` 1024, `medium` 8192, `high` 24576, plus `off` 0 with the native disable form for flash and flash-lite only (2.5 Pro cannot switch thinking off); the wire value is the budget as a string, sent as the number thinkingBudget. Unknown models get null.
 * @param opts.model Provider-native model id.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-native model id. */
        model: string;
    },
): types.models.ReasoningCapabilities | null {
    const k = ctx.fns.models.provider.gemini.constants({});
    const profile = "gemini-code-assist-" + k.modelsVersion;
    const id = opts.model.replace(/^models\//, "");
    const m = k.models.find(x => x.id === id) ?? (/^gemini-3(\.\d+)?-/.test(id) ? { family: "3" as const, variant: /flash/.test(id) ? "flash" as const : "pro" as const } : /^gemini-2\.5-/.test(id) ? { family: "2.5" as const, variant: /flash-lite/.test(id) ? "flash-lite" as const : /flash/.test(id) ? "flash" as const : "pro" as const } : null);
    if (!m) return null;
    if (m.family === "3") {
        const supported: types.models.ReasoningLevel[] = m.variant === "pro" ? ["low", "high"] : ["low", "medium", "high"];
        return { supported, wire: Object.fromEntries(supported.map(l => [l, l])), source: "profile", profile };
    }
    const budgets = { low: "1024", medium: "8192", high: "24576" };
    if (m.variant === "pro") return { supported: ["low", "medium", "high"], wire: budgets, source: "profile", profile };
    return { supported: ["off", "low", "medium", "high"], wire: { ...budgets, off: "0" }, disable: true, source: "profile", profile };
}
