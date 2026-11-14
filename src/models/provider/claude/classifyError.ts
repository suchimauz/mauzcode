/**
 * Classify Claude subscription HTTP failures into quota, retry, auth and overflow decisions
 *
 * Use for Claude API responses before retrying or parking subscription calls. Reads Retry-After and Anthropic reset headers, preserving the compatibility failure shape. Transport proxy errors are handled by models transport; this helper does not resolve legacy providers.
 * @param opts.account Credential account label in diagnostics. @default default
 * @param opts.status HTTP response status; omitted means no HTTP status. @minimum 0 @maximum 599
 * @param opts.body Raw response body, truncated in diagnostic output.
 * @param opts.headers Response headers containing retry or subscription reset timing.
 * @param opts.now Current epoch milliseconds for deterministic reset and retry calculations.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Credential account label in diagnostics. @default default */
        account?: string;
        /** HTTP response status; omitted means no HTTP status. @minimum 0 @maximum 599 */
        status?: number;
        /** Raw response body, truncated in diagnostic output. */
        body?: string;
        /** Response headers containing retry or subscription reset timing. */
        headers?: Headers | Record<string, string> | null;
        /** Current epoch milliseconds for deterministic reset and retry calculations. */
        now?: number;
    },
): { kind: "usage_limit" | "rate_limit" | "transient" | "auth" | "overflow" | "fatal"; code: "USAGE_LIMIT" | "QUOTA" | "RATE_LIMIT" | "AUTH" | "OVERFLOW" | "EMPTY_RESPONSE" | "SERVER" | "TIMEOUT" | "TRANSPORT" | "FATAL"; provider: string; account: string; message: string; retryable: boolean; status?: number; resetsAt?: number | null; retryAfterMs?: number; planType?: string; raw?: string } {
    const provider = "anthropic-oauth";
        const account = opts.account ?? "default";
        const kind = "subscription";
        const status = Number(opts.status ?? 0);
        const body = String(opts.body ?? "");
        const now = opts.now ?? Date.now();
        const header = headerReader(opts.headers);
    
        const parsed = safeJson(body);
        const err = parsed?.error ?? parsed ?? null;
        const code = String(err?.type ?? err?.code ?? "");
        const serverMessage = typeof err?.message === "string" ? err.message : "";
    
        // Anthropic and OpenAI both use Retry-After; it is a directive, not a hint.
        const retryAfterMs = parseRetryAfter(header("retry-after"), now);
    
        // ---- quota exhausted on a subscription -------------------------------
        const quotaCode = /usage_limit_reached|usage_not_included|quota_exceeded|credits_depleted/i.test(code);
        const quotaText = /usage limit (?:has been )?reached|out of credits|quota exceeded/i.test(serverMessage || body);
        // A generic `rate_limit_error` with no quota fields is ordinary throttling,
        // even for subscription credentials. Anthropic can emit it transiently
        // while `/api/oauth/usage` still reports plenty of quota. Park only when
        // the provider explicitly identifies exhausted usage/credits.
        if (kind === "subscription" && (quotaCode || quotaText)) {
            const resetsAt = subscriptionResetsAt(err, header, now);
            const planType = typeof err?.plan_type === "string" ? err.plan_type : undefined;
            return {
                kind: "usage_limit",
                code: "USAGE_LIMIT",
                provider,
                account,
                planType,
                resetsAt,
                status: status || undefined,
                retryable: false,
                message: usageLimitMessage(provider, planType, resetsAt, now),
                raw: body.slice(0, 2000),
            };
        }
    
        // ---- pay-per-token account with no money left ------------------------
        // Retrying cannot help and the server never says when, so this is fatal
        // rather than a rate limit: the user has to top up or switch provider.
        if (/insufficient_quota|billing_hard_limit_reached|billing_not_active/i.test(code + " " + serverMessage + " " + body)) {
            return {
                kind: "fatal",
                code: "QUOTA",
                provider,
                account,
                status: status || undefined,
                retryable: false,
                message: `${provider}: account balance depleted — add funds or switch models`,
                raw: body.slice(0, 2000),
            };
        }
    
        // ---- ordinary throttling ---------------------------------------------
        if (status === 429 || /rate.?limit/i.test(code + " " + serverMessage)) {
            return {
                kind: "rate_limit",
                code: "RATE_LIMIT",
                provider,
                account,
                status: status || undefined,
                retryAfterMs: retryAfterMs ?? undefined,
                retryable: true,
                message: `${provider}: rate limited (429) — retry in ${Math.round((retryAfterMs ?? 5_000) / 1000)}s`,
                raw: body.slice(0, 2000),
            };
        }
    
        // ---- credentials ------------------------------------------------------
        if (status === 401 || status === 403 || /invalid_api_key|authentication_error|unauthorized/i.test(code)) {
            return {
                kind: "auth",
                code: "AUTH",
                provider,
                account,
                status: status || undefined,
                retryable: false,
                message: `${provider}/${account}: authorization rejected — update the key or sign in again`,
                raw: body.slice(0, 2000),
            };
        }
    
        // ---- context window ---------------------------------------------------
        if (status === 413 || /context_length_exceeded|request_too_large|prompt is too long|exceeds the context window|exceeded model token limit/i.test(code + " " + serverMessage + " " + body)) {
            return {
                kind: "overflow",
                code: "OVERFLOW",
                provider,
                account,
                status: status || undefined,
                retryable: false,
                message: `${provider}: request exceeds the context window — compaction required`,
                raw: body.slice(0, 2000),
            };
        }
    
        // A completed provider stream without content is safe to retry.
        if (/empty[_ ]response|empty content|no (?:response|content|output)/i.test(code + " " + body)) {
            return { kind: "transient", code: "EMPTY_RESPONSE", provider, account, retryable: true,
                message: `${provider}: empty response`, raw: body.slice(0, 2000) };
        }
    
        // ---- transport / server ----------------------------------------------
        if ((status >= 500 && status <= 599) || status === 408
            || /upstream\s+connect|connection\s+(?:was\s+)?(?:reset|termination|refused|closed)|service\s+unavailable|overloaded|stalled|ETIMEDOUT|ECONNRESET|timed? ?out|network|fetch failed|ECONNREFUSED|EPIPE|socket/i.test(body + " " + serverMessage)) {
            return {
                kind: "transient",
                code: status === 408 || /ETIMEDOUT|timed? ?out|stalled/i.test(body) ? "TIMEOUT" : status >= 500 ? "SERVER" : "TRANSPORT",
                provider,
                account,
                status: status || undefined,
                retryAfterMs: retryAfterMs ?? undefined,
                retryable: true,
                message: `${provider}: temporary failure${status ? ` (${status})` : ""} — retry`,
                raw: body.slice(0, 2000),
            };
        }
    
        return {
            kind: "fatal",
            code: "FATAL",
            provider,
            account,
            status: status || undefined,
            retryable: false,
            message: serverMessage
                ? `${provider}${status ? ` ${status}` : ""}: ${serverMessage.slice(0, 300)}`
                : `${provider}${status ? ` ${status}` : ""}: ${body.slice(0, 300) || "unknown error"}`,
            raw: body.slice(0, 2000),
        };
    
    function headerReader(headers: Headers | Record<string, string> | null | undefined) {
        return (name: string): string | null => {
            if (!headers) return null;
            if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
            const bag = headers as Record<string, string>;
            return bag[name] ?? bag[name.toLowerCase()] ?? Object.entries(bag).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null;
        };
    }
    function safeJson(text: string): any {
        try { return JSON.parse(text); } catch { return null; }
    }
    function parseRetryAfter(value: string | null, now: number): number | null {
        if (!value) return null;
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
        const at = Date.parse(value);
        return Number.isFinite(at) ? Math.max(0, at - now) : null;
    }
    function subscriptionResetsAt(err: any, header: (n: string) => string | null, now: number): number | null {
        const secs = Number(err?.resets_at);
        if (Number.isFinite(secs) && secs > 0) return Math.round(secs * 1000);
        const inSecs = Number(err?.resets_in_seconds);
        if (Number.isFinite(inSecs) && inSecs > 0) return now + Math.round(inSecs * 1000);
        for (const name of ["anthropic-ratelimit-unified-5h-reset", "anthropic-ratelimit-unified-7d-reset", "anthropic-ratelimit-unified-reset"]) {
            const raw = header(name);
            const value = Number(raw);
            if (Number.isFinite(value) && value > 0) return Math.round(value * 1000);
            const at = raw ? Date.parse(raw) : NaN;
            if (Number.isFinite(at)) return at;
        }
        return null;
    }
    function usageLimitMessage(provider: string, planType: string | undefined, resetsAt: number | null, now: number): string {
        const plan = planType ? ` (plan ${planType})` : "";
        if (!resetsAt) return `Subscription limit for ${provider}${plan} exhausted. Reset time unknown.`;
        const left = Math.max(0, resetsAt - now);
        const hours = Math.floor(left / 3_600_000);
        const days = Math.floor(hours / 24);
        const human = days >= 1 ? `${days}d ${hours % 24}h` : hours >= 1 ? `${hours}h ${Math.floor((left % 3_600_000) / 60_000)}m` : `${Math.ceil(left / 60_000)}m`;
        return `Subscription limit for ${provider}${plan} exhausted. Quota resets at ${new Date(resetsAt).toLocaleString()} (in ${human}).`;
    }
}
