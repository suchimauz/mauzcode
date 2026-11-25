type Effort = types.models.ReasoningLevel | "auto";
/**
 * Resolve Claude native-model effort preferences while preserving subscription wire defaults
 *
 * Use inside the Claude subscription adapter to retain existing reasoning behavior without legacy route resolution. Auto on Claude 5 (Opus, Sonnet, Haiku, Fable) omits effort while thinking remains adaptive; Claude 4.6 defaults to medium. Unknown models have no effort control. SDK capability normalization remains resolveReasoning.
 * @param opts.model Provider-native Claude model id, not a provider or SSH route.
 * @param opts.effort Requested preference; unrecognized runtime values normalize to auto. @default auto
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-native Claude model id, not a provider or SSH route. */
        model: string;
        /** Requested preference; unrecognized runtime values normalize to auto. @default auto */
        effort?: Effort;
    },
): Promise<{ requested: Effort; applied: Effort; mode: "none" | "anthropic-adaptive"; downgraded: boolean; reason: string | null }> {
    const allowed: Effort[] = ["auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"];
        const requested = allowed.includes(opts.effort ?? "auto") ? (opts.effort ?? "auto") : "auto";
        // Preserve Claude wire defaults, including Claude 5 auto omitting effort.
        const modelId = opts.model.toLowerCase();
        const adaptive5 = /(opus|sonnet|haiku|fable)-5/.test(modelId);
        const adaptive46 = /(opus|sonnet)-4-6/.test(modelId);
        // Maximum effort: Opus 4.6+, Fable, and Sonnet/Haiku from 5.5 on.
        const max = /opus-(5|4-6)|fable-5|(sonnet|haiku)-5-[5-9](?!\d)/.test(modelId);
        const caps: { supported: Effort[]; defaultEffort: Effort; mode: "none" | "anthropic-adaptive" } = adaptive5 || adaptive46
            ? { supported: ["auto", ...(adaptive46 ? ["off" as const] : []), "low", "medium", "high", ...(max ? ["xhigh" as const] : [])], defaultEffort: adaptive5 ? "off" : "medium", mode: "anthropic-adaptive" }
            : { supported: ["auto", "off"], defaultEffort: "off", mode: "none" };
        if (requested === "auto") return { requested, applied: caps.defaultEffort, mode: caps.mode, downgraded: false, reason: null };
        if (caps.supported.includes(requested)) return { requested, applied: requested as Exclude<Effort, "auto">, mode: caps.mode, downgraded: false, reason: null };
        const order: Array<Exclude<Effort, "auto">> = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
        const start = order.indexOf(requested as any);
        let applied: Effort = caps.defaultEffort;
        let found = false;
        for (let i = start; i >= 0; i--) if (caps.supported.includes(order[i]!)) { applied = order[i]!; found = true; break; }
        // Nothing at or below the request (e.g. "off" on a model that always reasons): take the lowest supported level above it.
        if (!found) for (let i = start + 1; i < order.length; i++) if (caps.supported.includes(order[i]!)) { applied = order[i]!; break; }
        return { requested, applied, mode: caps.mode, downgraded: applied !== requested, reason: `${requested} is unsupported by ${opts.model}; using ${applied}` };
}
