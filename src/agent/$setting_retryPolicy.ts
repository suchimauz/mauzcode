// How hard the agent should try before it gives up on a broken model request.
//
// Model generation has no side effects: tools run only after a complete reply
// arrives and a partial reply is thrown away, so repeating an interrupted
// generation costs tokens, while not repeating it costs the user's work. This
// setting is where that trade is decided.
//
// Only a code AND a source agree to a retry here: the code must be in
// `retryableCodes`, and the failure itself must not be marked non-retryable.
// The provider knows details a code cannot carry (a SERVER 501 is not
// transient), so the intersection is deliberate.
/**
 * Declares the agent model retry policy: global limits, per-provider overrides and the codes allowed to retry.
 *
 * Use `settings.set({ module: "agent", key: "retryPolicy" })` to change it, or fix it for the
 * instance in `~/.mauzcode/settings/$settings_agent.json`. `maxRetries` counts retries per model
 * request (not per turn); the delay is exponential from `initialDelayMs` up to `maxDelayMs` with
 * ±`jitterRatio`. `retryableCodes` can only narrow the built-in allowed set — an unknown code is
 * rejected here on write and ignored when read from a file. `providers` maps a connection's
 * provider id (`claude`, `codex`, `custom`, …) to partial overrides merged over these values.
 */
export default {
    type: "json" as const,
    title: "Model retry policy",
    description:
        "Automatic retries of failed model requests. maxRetries = retries per model request; "
        + "initialDelayMs/maxDelayMs bound the exponential backoff and jitterRatio the random spread; "
        + "retryableCodes narrows the built-in allowed set (codes that waiting cannot fix are never retried); "
        + "providers maps a provider id to overrides such as { \"codex\": { \"maxRetries\": 2 } }. "
        + "A Retry-After longer than maxDelayMs parks the agent until that moment (at most 30 minutes) instead of failing the turn.",
    default: {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        jitterRatio: 0.2,
        retryableCodes: [
            "RATE_LIMIT", "RATE_LIMITED", "THROTTLED", "SERVER", "PROVIDER_UNAVAILABLE", "PROVIDER_ERROR", "TIMEOUT",
            "TRANSPORT", "STREAM_INTERRUPTED", "EMPTY_RESPONSE", "SSH_TRANSPORT",
            "PROXY_DNS", "PROXY_CONNECT", "PROXY_TIMEOUT", "PROXY_CONNECTION_LOST", "PROXY_PROTOCOL",
        ],
        providers: {} as Record<string, unknown>,
    },
    /** Rejects codes no policy can retry; called by settings.set. */
    validate(ctx: Context, value: unknown): void {
        if (value == null) return;
        if (typeof value !== "object" || Array.isArray(value)) {
            throw Object.assign(new Error("agent.retryPolicy must be an object"), { code: "INVALID_SETTING" });
        }
        const policy = value as Record<string, unknown>;
        for (const key of ["maxRetries", "initialDelayMs", "maxDelayMs", "jitterRatio"] as const) {
            if (policy[key] == null) continue;
            if (typeof policy[key] !== "number" || !Number.isFinite(policy[key])) {
                throw Object.assign(new Error(`agent.retryPolicy.${key} must be a finite number`), { code: "INVALID_SETTING" });
            }
        }
        if (policy.providers != null && (typeof policy.providers !== "object" || Array.isArray(policy.providers))) {
            throw Object.assign(new Error("agent.retryPolicy.providers must map a provider id to overrides"), { code: "INVALID_SETTING" });
        }
        const lists = policy as { retryableCodes?: unknown; providers?: Record<string, unknown> };
        checkCodes(ctx, lists.retryableCodes, "agent.retryPolicy.retryableCodes");
        for (const [provider, override] of Object.entries(lists.providers ?? {})) {
            if (override == null) continue;
            if (typeof override !== "object" || Array.isArray(override)) {
                throw Object.assign(new Error(`agent.retryPolicy.providers.${provider} must be an object`), { code: "INVALID_SETTING" });
            }
            checkCodes(ctx, (override as { retryableCodes?: unknown }).retryableCodes, `agent.retryPolicy.providers.${provider}.retryableCodes`);
        }
    },
};

/** Rejects a configured code that is unknown or that no policy may ever retry. */
function checkCodes(ctx: Context, codes: unknown, where: string): void {
    if (codes == null) return;
    if (!Array.isArray(codes)) throw Object.assign(new Error(`${where} must be an array of failure codes`), { code: "INVALID_SETTING" });
    const { allowed, never } = ctx.fns.agent.retryCodes({});
    for (const code of codes) {
        if (typeof code !== "string" || !allowed.includes(code)) {
            const reason = typeof code === "string" && never.includes(code)
                ? `${code} is never retried (waiting cannot fix it)`
                : `${String(code)} is not a known retryable failure code`;
            throw Object.assign(new Error(`${where}: ${reason}`), { code: "INVALID_SETTING" });
        }
    }
}
