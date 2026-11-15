/**
 * Resolve a model's effective context limit from an owner override and provider metadata
 *
 * The single precedence implementation for local context budgets: a valid owner override wins, then a valid provider context window, then the 200,000-token fallback. Pure and network-free; invalid inputs are treated as absent. Use wherever a model's budget or its provenance is displayed or computed.
 * @param opts.provider Provider catalogue contextWindow, if any.
 * @param opts.override Owner override for this connection and model, if any.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider catalogue contextWindow, if any. */
        provider?: number | null;
        /** Owner override for this connection and model, if any. */
        override?: number | null;
    },
): types.models.ContextLimit {
    const valid = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null;
    const provider = typeof opts.provider === "number" && Number.isFinite(opts.provider) && opts.provider > 0 ? Math.floor(opts.provider) : null;
    const override = valid(opts.override);
    if (override !== null) return { provider, override, effective: override, source: "override" };
    if (provider !== null) return { provider, override, effective: provider, source: "provider" };
    return { provider, override, effective: 200_000, source: "fallback" };
}
