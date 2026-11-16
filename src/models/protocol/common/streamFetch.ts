/** What a provider failure classifier may return: null means fall back to the status rules. */
type ClassifiedFailure = { code: string; classification: types.models.FailureInfo["classification"]; retryable: boolean; retryAfterMs?: number; resetAt?: number; message: string } | null;

/**
 * Send one streaming generation request for a shared protocol and classify HTTP failures
 *
 * Shared by every Protocol.stream: rejects an already aborted signal before sending, sends the request through the transport-bound fetch, and on a non-success status cancels the body and throws an SDK failure (models.inference.failure). When a provider failure classifier is supplied it reads at most 16 KiB of the failed response body, JSON-parses it (else null), consults the classifier and uses its stable code, classification, retryability, reset time and fixed message; a classifier that returns nothing or throws falls back to the status-only rules — 401/403 auth, 429 throttled with retry-after, 400/404/413/422 invalid_input, 408/5xx provider; all retryable classes are replay-safe with acceptance rejected. Never includes the upstream body in the message. Returns the response with a readable body.
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
        /** Protocol label used in failure messages. */
        label: string;
        /** Optional cancellation signal. */
        signal?: AbortSignal;
        /** Optional provider classifier: receives the status and the bounded JSON-parsed error body (null when unparseable); its fixed message replaces the generic one, null or a throw falls back to the status rules. */
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
    if (opts.classifyFailure && response.body) {
        // Bounded read: at most 16 KiB of the failed body, JSON-parsed or null. The body text itself
        // never reaches a message — only the classifier's own fixed strings do.
        let parsed: unknown = null;
        try {
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let received = 0;
            while (received < 16384) {
                const { done, value } = await reader.read();
                if (done || !value) break;
                chunks.push(value);
                received += value.length;
            }
            await reader.cancel().catch(() => undefined);
            const merged = new Uint8Array(Math.min(received, 16384));
            let at = 0;
            for (const chunk of chunks) {
                if (at >= merged.length) break;
                merged.set(chunk.subarray(0, Math.min(chunk.length, merged.length - at)), at);
                at += chunk.length;
            }
            parsed = JSON.parse(new TextDecoder().decode(merged));
        } catch { parsed = null; }
        let classified: ClassifiedFailure = null;
        try { classified = await opts.classifyFailure({ status, body: parsed }) ?? null; } catch { classified = null; }
        if (classified && typeof classified.message === "string" && classified.message) {
            const info: types.models.FailureInfo = {
                upstreamStatus: status, acceptance: "rejected", replaySafe: true,
                code: classified.code, classification: classified.classification, retryable: classified.retryable,
                ...(classified.retryAfterMs !== undefined ? { retryAfterMs: classified.retryAfterMs } : retryAfterMs !== undefined ? { retryAfterMs } : {}),
                ...(classified.resetAt !== undefined ? { resetAt: classified.resetAt } : {}),
            };
            throw ctx.fns.models.inference.failure({ message: classified.message, status: info.classification === "invalid_input" ? 400 : 502, info });
        }
    }
    await response.body?.cancel().catch(() => undefined);
    const base = { upstreamStatus: status, acceptance: "rejected" as const, replaySafe: true };
    const info: types.models.FailureInfo = !response.ok && (status === 401 || status === 403) ? { ...base, code: "AUTH", classification: "auth", retryable: false }
        : status === 429 ? { ...base, code: "THROTTLED", classification: "throttled", retryable: true, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) }
        : [400, 404, 413, 422].includes(status) ? { ...base, code: "INVALID_INPUT", classification: "invalid_input", retryable: false }
        : status === 408 || status >= 500 ? { ...base, code: "PROVIDER_UNAVAILABLE", classification: "provider", retryable: true, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) }
        : response.ok ? { ...base, code: "PROTOCOL", classification: "provider", acceptance: "uncertain", retryable: false }
        : { ...base, code: "PROVIDER_ERROR", classification: "provider", retryable: false };
    throw ctx.fns.models.inference.failure({ message: response.ok ? `${opts.label} response has no stream body` : `${opts.label} request failed (HTTP ${status})`, status: info.classification === "invalid_input" ? 400 : 502, info });
}
