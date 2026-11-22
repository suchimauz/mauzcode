/**
 * Normalize a reasoning preference against validated model capabilities
 *
 * SDK reasoning normalization used by models.stream for providers declaring capabilities.reasoning. Uses discovery metadata when present, otherwise the provider's documented profile. Omitted or auto resolves to the default, or to "auto" (send nothing) when the capabilities declare no default; a supported level is kept; otherwise the nearest supported level at or below the request, else the lowest supported level above it. Fails INVALID_INPUT for a preference outside the SDK enumeration or invalid metadata (empty, duplicate or unknown levels, unsupported default, wire values that are empty, over 40 characters or for unsupported levels, non-boolean disable, adaptive or effort). The applied level's declared wire value, the disable flag and, for a concrete applied level other than off, the adaptive and effort flags are returned for shared protocols and CAPABILITY_UNAVAILABLE when neither metadata nor a profile applies — never guesses or sends auto.
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
        metadata?: { supported: unknown; default?: unknown; wire?: unknown; disable?: unknown; adaptive?: unknown; effort?: unknown } | null;
        /** Documented SDK profile for this model, or null when none applies. */
        profile?: types.models.ReasoningCapabilities | null;
    },
): types.models.ReasoningResolution {
    const order: types.models.ReasoningLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
    const invalid = (message: string) => ctx.fns.models.inference.failure({ message, status: 400, info: { code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
    const requested = (opts.preference ?? "auto") as types.models.ReasoningLevel | "auto";
    if (requested !== "auto" && !order.includes(requested)) throw invalid(`Unknown reasoning preference ${JSON.stringify(String(opts.preference).slice(0, 40))}`);
    const raw = opts.metadata ?? opts.profile ?? null;
    if (!raw) throw ctx.fns.models.inference.failure({ message: `No reasoning capabilities are known for model ${opts.model}`, status: 400, info: { code: "CAPABILITY_UNAVAILABLE", classification: "capability_unavailable", acceptance: "none", retryable: false, replaySafe: true } });
    const source: types.models.ReasoningCapabilities["source"] = opts.metadata ? "metadata" : "profile";
    const supported = raw.supported;
    if (!Array.isArray(supported) || !supported.length || supported.some(l => !order.includes(l)) || new Set(supported).size !== supported.length)
        throw invalid(`Invalid reasoning ${source} for model ${opts.model}: supported levels must be a nonempty unique SDK enumeration`);
    const levels = supported as types.models.ReasoningLevel[];
    const def = raw.default;
    if (def !== undefined && !levels.includes(def as types.models.ReasoningLevel)) throw invalid(`Invalid reasoning ${source} for model ${opts.model}: default is not supported`);
    const wire = raw.wire;
    if (wire !== undefined && (!wire || typeof wire !== "object" || Array.isArray(wire) || Object.entries(wire).some(([l, v]) => !levels.includes(l as types.models.ReasoningLevel) || typeof v !== "string" || !v || v.length > 40)))
        throw invalid(`Invalid reasoning ${source} for model ${opts.model}: wire values must be nonempty strings for supported levels`);
    if (raw.disable !== undefined && typeof raw.disable !== "boolean") throw invalid(`Invalid reasoning ${source} for model ${opts.model}: disable must be boolean`);
    if (raw.adaptive !== undefined && typeof raw.adaptive !== "boolean") throw invalid(`Invalid reasoning ${source} for model ${opts.model}: adaptive must be boolean`);
    if (raw.effort !== undefined && typeof raw.effort !== "boolean") throw invalid(`Invalid reasoning ${source} for model ${opts.model}: effort must be boolean`);
    const base = { source, ...(source === "profile" && opts.profile?.profile ? { profile: opts.profile.profile } : {}) };
    // Wire, disable, adaptive and effort are attached only to a concrete applied level; auto sends nothing.
    const extra = (applied: types.models.ReasoningLevel) => {
        const value = (wire as Partial<Record<types.models.ReasoningLevel, string>> | undefined)?.[applied];
        const on = applied !== "off";
        return {
            ...(value ? { wire: value } : {}),
            ...(applied === "off" && raw.disable === true ? { disable: true } : {}),
            ...(on && raw.adaptive === true ? { adaptive: true } : {}),
            ...(on && raw.effort === false ? { effort: false } : {}),
        };
    };
    if (requested === "auto") return def === undefined ? { requested, applied: "auto", fallbackReason: null, ...base } : { requested, applied: def as types.models.ReasoningLevel, fallbackReason: null, ...base, ...extra(def as types.models.ReasoningLevel) };
    if (levels.includes(requested)) return { requested, applied: requested, fallbackReason: null, ...base, ...extra(requested) };
    const at = order.indexOf(requested);
    const applied = order.slice(0, at).reverse().find(l => levels.includes(l)) ?? order.slice(at + 1).find(l => levels.includes(l))!;
    return { requested, applied, fallbackReason: `${requested} is unsupported by ${opts.model}; using ${applied}`, ...base, ...extra(applied) };
}
