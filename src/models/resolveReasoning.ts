/**
 * Normalize a reasoning preference against validated model capabilities
 *
 * SDK reasoning normalization used by models.stream for providers declaring capabilities.reasoning. Uses discovery metadata when present, otherwise the provider's documented profile. Omitted or auto resolves to the default; a supported level is kept; otherwise the nearest supported level at or below the request, else the lowest supported level above it. Fails INVALID_INPUT for a preference outside the SDK enumeration or invalid metadata (empty, duplicate or unknown levels, unsupported default) and CAPABILITY_UNAVAILABLE when neither metadata nor a profile applies — never guesses or sends auto.
 * @param opts.model Provider-native model id, used in diagnostics.
 * @param opts.preference Caller reasoning preference; omitted means auto.
 * @param opts.metadata Reasoning capabilities reported by model discovery, when known.
 * @param opts.profile Documented SDK profile for this model, or null when none applies.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Provider-native model id, used in diagnostics. */
        model: string;
        /** Caller reasoning preference; omitted means auto. */
        preference?: string;
        /** Reasoning capabilities reported by model discovery, when known. */
        metadata?: { supported: unknown; default: unknown } | null;
        /** Documented SDK profile for this model, or null when none applies. */
        profile?: types.models.ReasoningCapabilities | null;
    },
): types.models.ReasoningResolution {
    return ctx.fns.models.inference.resolveReasoning(opts);
}
