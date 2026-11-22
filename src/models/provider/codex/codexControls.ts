/** Validate explicit Codex response controls against one account-bound catalogue entry. Defaults never imply consent. */
export default function (ctx: Context, session: Session | null, opts: {
    /** Untrusted SDK options; only a plain object with documented own keys is accepted. */
    options?: unknown;
    /** Trusted route metadata, absent for a missing or unbound catalogue. */
    model?: types.models.ModelInfo;
}): { service_tier?: "priority" | "ultrafast"; verbosity?: "low" | "medium" | "high" } {
    const value = opts.options;
    if (value === undefined) return {};
    const invalid = () => ctx.fns.models.inference.failure({ message: "Invalid or unavailable Codex response control", status: 400, info: { code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Reflect.ownKeys(value).some(key => key !== "speed" && key !== "verbosity")) throw invalid();
    const controls = opts.model?.responseControls;
    const result: { service_tier?: "priority" | "ultrafast"; verbosity?: "low" | "medium" | "high" } = {};
    if (Object.hasOwn(value, "speed")) {
        const speed = (value as Record<string, unknown>).speed;
        if (speed !== "standard") {
            if ((speed !== "fast" && speed !== "ultrafast") || !controls?.speed?.supported.includes(speed)) throw invalid();
            result.service_tier = speed === "fast" ? "priority" : "ultrafast";
        }
    }
    if (Object.hasOwn(value, "verbosity")) {
        const verbosity = (value as Record<string, unknown>).verbosity;
        if (verbosity !== "default") {
            if ((verbosity !== "low" && verbosity !== "medium" && verbosity !== "high") || !controls?.verbosity?.supported.includes(verbosity)) throw invalid();
            result.verbosity = verbosity;
        }
    }
    return result;
}
