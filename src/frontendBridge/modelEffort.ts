/**
 * Project a reasoning preference onto catalogue reasoning levels
 *
 * Use in UI projections to show the requested and applied reasoning effort of one model from its connection catalogue metadata, without provider calls. Auto applies the catalogue default; an unsupported level uses the nearest supported level below it, else the lowest above. Supported levels start with auto when any level exists. Without catalogue reasoning metadata the mode is none and no levels are offered.
 * @param opts.reasoning Reasoning levels and default from ModelInfo.reasoning, or null when unknown.
 * @param opts.requested Stored reasoning preference; unknown values normalize to auto. @default auto
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Reasoning levels and default from ModelInfo.reasoning, or null when unknown. */
        reasoning?: { supported: types.models.ReasoningLevel[]; default: types.models.ReasoningLevel } | null;
        /** Stored reasoning preference; unknown values normalize to auto. @default auto */
        requested?: string;
    },
): { requested: types.models.ReasoningLevel | "auto"; applied: types.models.ReasoningLevel | "auto"; supported: Array<types.models.ReasoningLevel | "auto">; defaultEffort: types.models.ReasoningLevel | "auto"; mode: "none" | "catalogue"; downgraded: boolean } {
    const order: types.models.ReasoningLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
        const allowed = ["auto", ...order];
        const requested = (allowed.includes(String(opts.requested)) ? opts.requested : "auto") as types.models.ReasoningLevel | "auto";
        const levels = (opts.reasoning?.supported ?? []).filter(level => order.includes(level));
        const fallback = opts.reasoning && levels.includes(opts.reasoning.default) ? opts.reasoning.default : levels[0];
        if (!levels.length || !fallback) return { requested, applied: requested, supported: [], defaultEffort: "auto", mode: "none", downgraded: false };
        let applied: types.models.ReasoningLevel = fallback;
        if (requested !== "auto") {
            const at = order.indexOf(requested);
            applied = levels.includes(requested) ? requested : order.slice(0, at).reverse().find(level => levels.includes(level)) ?? order.slice(at + 1).find(level => levels.includes(level)) ?? fallback;
        }
        return { requested, applied, supported: ["auto" as const, ...order.filter(level => levels.includes(level))], defaultEffort: fallback, mode: "catalogue", downgraded: requested !== "auto" && applied !== requested };
}
