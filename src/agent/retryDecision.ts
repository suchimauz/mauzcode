// One question, answered from machine codes only: should this failed model
// request be sent again, and after how long?
//
// The rule is an AND, not an OR. A code must be allowed by `agent.retryPolicy`,
// AND the failure must not have been marked non-retryable by the code that
// raised it — the provider knows things the code cannot say (a SERVER 501 is
// permanent, a SERVER 503 is not, and an in-stream provider error must never be
// replayed). Message text is never parsed: prose changes with every vendor and
// every version.
//
// SDK `replaySafe` and `acceptance` are deliberately ignored for generation.
// They answer "may repeating this duplicate upstream work", which is false for
// streams cut mid-flight; for a generation whose output is discarded the only
// real cost of a repeat is tokens, and the alternative is a lost turn.
const PARK_CAP_MS = 30 * 60_000;
/** Codes already reported as unknown; a stale settings file must not spam the log. */
const REPORTED = new Set<string>();

/**
 * Decides whether a failed model request may be retried and, if so, how long to wait.
 *
 * Use in agent turns and compaction before scheduling another attempt. Accepts any thrown model
 * error: SDK `failure` metadata, an SSH transport failure, or a bare structured `code`. A failure
 * is retried only when its code is allowed by `agent.retryPolicy` (globally or by the provider's
 * override) AND its source did not mark it non-retryable; codes in `agent.retryCodes().never` are
 * never retried, whatever the settings say. A Retry-After longer than `maxDelayMs` returns
 * `retry: false` with `parkUntil` (capped at 30 minutes) instead of retrying too early.
 * @param opts.error The thrown error of the failed request.
 * @param opts.provider Provider id of the connection, used for `providers` overrides.
 * @param opts.retry Retries already performed for this model request; zero selects the first retry. @minimum 0
 * @param opts.now Current time in ms, for testing. @default Date.now()
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** The thrown error of the failed request. */
        error: any;
        /** Provider id of the connection, used for `providers` overrides. */
        provider?: string;
        /** Retries already performed for this model request; zero selects the first retry. @minimum 0 */
        retry: number;
        /** Current time in ms, for testing. @default Date.now() */
        now?: number;
    },
): Promise<{
    retry: boolean;
    delayMs: number;
    maxRetries: number;
    provider: string;
    code: string | null;
    upstreamStatus: number | null;
    parkUntil?: number;
}> {
    const provider = String(opts.provider ?? "");
    const source = normalize(opts.error);
    const policy = await effectivePolicy({ ctx, provider });
    const answer = {
        retry: false, delayMs: 0, maxRetries: policy.maxRetries, provider,
        code: source.code, upstreamStatus: source.upstreamStatus,
    };
    if (!source.code) return answer;
    // Never-list first: an exhausted subscription parks, an expired token fails now,
    // and neither may ever be turned into a retry by a settings file.
    if (ctx.fns.agent.retryCodes({}).never.includes(source.code)) return answer;
    // The AND rule. Only an explicit false blocks: an absent flag means the source
    // had no opinion about transience.
    if (source.retryable === false) return answer;
    if (!policy.retryableCodes.includes(source.code)) return answer;

    // A long Retry-After is not a delay to wait out inside a turn: it is a wait to
    // park for, and the retry counter is not what gates it.
    if (source.retryAfterMs != null && Number.isFinite(source.retryAfterMs) && source.retryAfterMs > policy.maxDelayMs) {
        return { ...answer, parkUntil: (opts.now ?? Date.now()) + Math.min(source.retryAfterMs, PARK_CAP_MS) };
    }
    if (!Number.isInteger(opts.retry) || opts.retry < 0 || opts.retry >= policy.maxRetries) return answer;

    const base = Math.min(policy.maxDelayMs, policy.initialDelayMs * 2 ** Math.min(opts.retry, 52));
    const spread = base * policy.jitterRatio;
    const jittered = Math.max(0, Math.round(base + (Math.random() * 2 - 1) * spread));
    const hinted = source.retryAfterMs != null && Number.isFinite(source.retryAfterMs) ? source.retryAfterMs : 0;
    return { ...answer, retry: true, delayMs: Math.max(hinted, jittered) };
}

/** Reads one structured code out of whatever shape the failure arrived in. */
function normalize(error: any): {
    code: string | null;
    retryable: boolean | undefined;
    retryAfterMs: number | null;
    upstreamStatus: number | null;
} {
    const failure = error?.failure;
    if (failure && typeof failure.code === "string" && failure.code) {
        return {
            code: failure.code,
            retryable: typeof failure.retryable === "boolean" ? failure.retryable : undefined,
            retryAfterMs: finiteOrNull(failure.retryAfterMs),
            upstreamStatus: finiteOrNull(failure.upstreamStatus),
        };
    }
    const ssh = error?.transportFailure;
    if (ssh?.kind === "ssh_transport") {
        // A permanent SSH failure is a configuration or access problem: the same
        // request through the same tunnel will fail the same way.
        return ssh.phase === "permanent"
            ? { code: "SSH_PERMANENT", retryable: false, retryAfterMs: null, upstreamStatus: null }
            : { code: "SSH_TRANSPORT", retryable: typeof ssh.retryable === "boolean" ? ssh.retryable : true, retryAfterMs: null, upstreamStatus: null };
    }
    if (typeof error?.code === "string" && error.code) {
        return {
            code: error.code,
            retryable: typeof error.retryable === "boolean" ? error.retryable : undefined,
            retryAfterMs: finiteOrNull(error.retryAfterMs),
            upstreamStatus: finiteOrNull(error.status),
        };
    }
    return { code: null, retryable: undefined, retryAfterMs: null, upstreamStatus: null };
}

function finiteOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Resolves the policy for one provider: global values, then the provider's override.
 *
 * Every number is clamped instead of trusted — a settings typo must not produce a
 * negative delay or a retry loop with no bound.
 */
async function effectivePolicy(opts: { ctx: Context; provider: string }): Promise<{
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    jitterRatio: number;
    retryableCodes: string[];
}> {
    const { ctx } = opts;
    const raw = await ctx.fns.settings.get({ module: "agent", scopeType: "global", key: "retryPolicy" });
    const global = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, any> : {};
    const overrides = global.providers && typeof global.providers === "object" && !Array.isArray(global.providers)
        ? global.providers as Record<string, any> : {};
    const override = opts.provider && overrides[opts.provider] && typeof overrides[opts.provider] === "object" ? overrides[opts.provider] : {};
    const merged = { ...global, ...override };
    const maxDelayMs = clamp(merged.maxDelayMs, 60000, 0, 2147483647);
    const limits = ctx.fns.agent.retryCodes({}).allowed;
    return {
        maxRetries: Math.floor(clamp(merged.maxRetries, 5, 0, Number.MAX_SAFE_INTEGER)),
        initialDelayMs: clamp(merged.initialDelayMs, 1000, 0, maxDelayMs),
        maxDelayMs,
        jitterRatio: clamp(merged.jitterRatio, 0.2, 0, 1),
        retryableCodes: codes(ctx, merged.retryableCodes, limits),
    };
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

/**
 * Keeps a configured code list honest: codes the built-in set does not contain are
 * dropped and reported once. A settings file written for an older build must not
 * silently make an unknown string retryable.
 */
function codes(ctx: Context, configured: unknown, allowed: string[]): string[] {
    if (!Array.isArray(configured)) return allowed;
    const kept: string[] = [];
    for (const code of configured) {
        if (typeof code === "string" && allowed.includes(code)) { kept.push(code); continue; }
        const key = String(code);
        if (REPORTED.has(key)) continue;
        REPORTED.add(key);
        ctx.fns.procs.log.warn({ event: "agent.retryPolicy.unknown-code", msg: `ignoring unknown retryable code ${key}` });
    }
    return kept;
}
