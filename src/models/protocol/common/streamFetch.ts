/** What a provider failure classifier may return: null means fall back to the status rules. */
type ClassifiedFailure = { code: string; classification: types.models.FailureInfo["classification"]; retryable: boolean; retryAfterMs?: number; resetAt?: number; message: string } | null;

/**
 * Send one streaming generation request for a shared protocol and classify HTTP failures
 *
 * Reads each failed HTTP body once (16 KiB maximum). Extracts safe evidence before consulting the optional classifier; classifier fields affect policy, not the displayed wording. A successful response without a body has uncertain acceptance.
 * @param opts.provider Resolved provider id for attribution.
 * @param opts.fetch Transport-bound fetch of the connection; never a direct fallback.
 * @param opts.url Absolute request URL.
 * @param opts.headers Request headers, including authentication.
 * @param opts.body JSON request body.
 * @param opts.label Protocol label used in failure messages.
 * @param opts.signal Optional cancellation signal.
 * @param opts.classifyFailure Optional provider classifier consulted before the status rules.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Transport-bound fetch of the connection; never a direct fallback. */
        fetch: types.models.ResolvedConnection["fetch"];
        /** Absolute request URL. */
        url: string;
        /** Request headers, including authentication. */
        headers: Record<string, string>;
        /** JSON request body. */
        body: Record<string, unknown>;
        /** Resolved provider id for attribution. */
        provider?: string;
        /** Protocol label used in failure messages. */
        label: string;
        /** Optional cancellation signal. */
        signal?: AbortSignal;
        /** Optional provider classifier: receives the status and the bounded JSON-parsed error body (null when unparseable); null or a throw falls back to the status rules. */
        classifyFailure?: (input: { status: number; body: unknown | null }) => Promise<ClassifiedFailure> | ClassifiedFailure;
    },
): Promise<Response & { body: ReadableStream<Uint8Array> }> {
    opts.signal?.throwIfAborted();
    const response = await opts.fetch(opts.url, {
        method: "POST",
        headers: { ...opts.headers, "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify(opts.body),
        ...(opts.signal ? { signal: opts.signal } : {}),
    });
    if (opts.signal?.aborted) { await response.body?.cancel().catch(() => undefined); opts.signal.throwIfAborted(); }
    const status = response.status;
    if (response.ok && response.body) return response as Response & { body: ReadableStream<Uint8Array> };
    // Retry-After as seconds or an HTTP date; malformed values give no hint.
    const raw = response.headers.get("retry-after");
    const seconds = raw !== null && /^\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw.trim()) * 1000 : undefined;
    const date = raw && raw.trim() && seconds === undefined ? Date.parse(raw) - Date.now() : undefined;
    const retryAfterMs = seconds ?? (date !== undefined && Number.isFinite(date) ? Math.max(0, date) : undefined);
    const parsed = !response.ok ? await ctx.fns.models.inference.readErrorBody({ response }) : null;
    opts.signal?.throwIfAborted();
    const diagnostic = ctx.fns.models.inference.providerDiagnostic({ provider: opts.provider ?? opts.label, stage: response.ok ? "stream" : "http", ...(response.ok ? {} : { status }), body: parsed, request: opts.body, secrets: Object.values(opts.headers) });
    if (!response.ok && opts.classifyFailure) {
        let classified: ClassifiedFailure = null;
        try { classified = await opts.classifyFailure({ status, body: parsed }) ?? null; } catch { classified = null; }
        opts.signal?.throwIfAborted();
        if (classified && typeof classified.message === "string" && classified.message) {
            const info: types.models.FailureInfo = {
                diagnostic, upstreamStatus: status, acceptance: "rejected", replaySafe: true,
                code: classified.code, classification: classified.classification, retryable: classified.retryable,
                ...(classified.retryAfterMs !== undefined ? { retryAfterMs: classified.retryAfterMs } : retryAfterMs !== undefined ? { retryAfterMs } : {}),
                ...(classified.resetAt !== undefined ? { resetAt: classified.resetAt } : {}),
            };
            throw ctx.fns.models.inference.failure({ message: diagnostic.summary, status: info.classification === "invalid_input" ? 400 : 502, info });
        }
    }
    const base = { diagnostic, upstreamStatus: status, acceptance: "rejected" as const, replaySafe: true };
    const info: types.models.FailureInfo = !response.ok && (status === 401 || status === 403) ? { ...base, code: "AUTH", classification: "auth", retryable: false }
        : status === 429 ? { ...base, code: "THROTTLED", classification: "throttled", retryable: true, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) }
        : [400, 404, 413, 422].includes(status) ? { ...base, code: "INVALID_INPUT", classification: "invalid_input", retryable: false }
        : status === 408 || status >= 500 ? { ...base, code: "PROVIDER_UNAVAILABLE", classification: "provider", retryable: true, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) }
        : response.ok ? { ...base, code: "PROTOCOL", classification: "provider", acceptance: "uncertain", retryable: false }
        : { ...base, code: "PROVIDER_ERROR", classification: "provider", retryable: false };
    throw ctx.fns.models.inference.failure({ message: diagnostic.summary, status: info.classification === "invalid_input" ? 400 : 502, info });
}
