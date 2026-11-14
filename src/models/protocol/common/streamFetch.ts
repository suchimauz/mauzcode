/**
 * Send one streaming generation request for a shared protocol and classify HTTP failures
 *
 * Shared by every Protocol.stream: rejects an already aborted signal before sending, sends the request through the transport-bound fetch, and on a non-success status cancels the body and throws an SDK failure (models.inference.failure) classified from the status only — 401/403 auth, 429 throttled with retry-after, 400/404/413/422 invalid_input, 408/5xx provider; all retryable classes are replay-safe with acceptance rejected. Never includes the upstream body in the message. Returns the response with a readable body.
 * @param opts.fetch Transport-bound fetch of the connection; never a direct fallback.
 * @param opts.url Absolute request URL.
 * @param opts.headers Request headers, including authentication.
 * @param opts.body JSON request body.
 * @param opts.label Protocol label used in failure messages.
 * @param opts.signal Optional cancellation signal.
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
        /** Protocol label used in failure messages. */
        label: string;
        /** Optional cancellation signal. */
        signal?: AbortSignal;
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
    await response.body?.cancel().catch(() => undefined);
    const raw = response.headers.get("retry-after");
    const seconds = raw !== null && /^\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw) * 1000 : undefined;
    const date = raw && seconds === undefined ? Date.parse(raw) - Date.now() : undefined;
    const retryAfterMs = seconds ?? (date !== undefined && Number.isFinite(date) ? Math.max(0, date) : undefined);
    const base = { upstreamStatus: status, acceptance: "rejected" as const, replaySafe: true };
    const info: types.models.FailureInfo = !response.ok && (status === 401 || status === 403) ? { ...base, code: "AUTH", classification: "auth", retryable: false }
        : status === 429 ? { ...base, code: "THROTTLED", classification: "throttled", retryable: true, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) }
        : [400, 404, 413, 422].includes(status) ? { ...base, code: "INVALID_INPUT", classification: "invalid_input", retryable: false }
        : status === 408 || status >= 500 ? { ...base, code: "PROVIDER_UNAVAILABLE", classification: "provider", retryable: true, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) }
        : response.ok ? { ...base, code: "PROTOCOL", classification: "provider", acceptance: "uncertain", retryable: false }
        : { ...base, code: "PROVIDER_ERROR", classification: "provider", retryable: false };
    throw ctx.fns.models.inference.failure({ message: response.ok ? `${opts.label} response has no stream body` : `${opts.label} request failed (HTTP ${status})`, status: info.classification === "invalid_input" ? 400 : 502, info });
}
