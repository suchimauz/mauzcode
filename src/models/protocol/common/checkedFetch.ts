/**
 * Send one shared-protocol request through a transport-bound fetch and return only a successful response.
 *
 * Use from shared protocol listModels/probe procedures. Rejects before calling fetch when the signal is already aborted; passes the signal through; cancels the body and rejects when the signal aborts after the response arrives; on a non-success status cancels the body and throws "<what> failed (HTTP n)" without exposing response content.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Transport-bound fetch of the connection; never a direct fallback. */
        fetch: types.models.ResolvedConnection["fetch"];
        /** Absolute request URL. */
        url: string;
        /** Request method, headers and body; the signal is supplied separately. */
        init: RequestInit;
        /** Neutral operation name used in the failure message, such as "Model discovery request". */
        what: string;
        /** Optional cancellation signal. */
        signal?: AbortSignal;
    },
): Promise<Response> {
    const { signal } = opts;
    signal?.throwIfAborted();
    const response = await opts.fetch(opts.url, { ...opts.init, ...(signal ? { signal } : {}) });
    if (signal?.aborted) {
        await response.body?.cancel().catch(() => undefined);
        signal.throwIfAborted();
    }
    if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(opts.what + " failed (HTTP " + response.status + ")");
    }
    return response;
}
