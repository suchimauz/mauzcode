/**
 * Build the SDK failure for a protocol stream that was cut off or malformed
 *
 * Used by every Protocol.stream when the event stream ends before its terminal event, contains invalid JSON or reports an in-stream error event. Returns a replay-safe transport failure (non-retryable provider failure for reported error frames) with acceptance uncertain, so models.call does not retry a request the upstream may have processed. The message never includes upstream payloads.
 * @param opts.provider Resolved provider id.
 * @param opts.body Provider error frame if present.
 * @param opts.request Sent request material for suppressing echoes.
 * @param opts.secrets Header values to suppress.
 * @param opts.label Protocol label used in the message.
 * @param opts.reason What went wrong: ended, malformed or error.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved provider id for attribution. */
        provider: string;
        /** Request material for suppressing echoed input. */
        request?: unknown;
        /** Credential values to remove from evidence. */
        secrets?: string[];
        /** Provider error envelope when available. */
        body?: unknown;
        /** Protocol label used in the message. */
        label: string;
        /** What went wrong: ended, malformed or error. */
        reason: "ended" | "malformed" | "error";
    },
): Error {
    const diagnostic = ctx.fns.models.inference.providerDiagnostic({ provider: opts.provider, stage: "stream", body: opts.body, request: opts.request, secrets: opts.secrets });
    return ctx.fns.models.inference.failure({
        message: diagnostic.summary, status: 502,
        info: opts.reason === "error"
            ? { diagnostic, code: "PROVIDER_ERROR", classification: "provider", acceptance: "uncertain", retryable: false, replaySafe: true }
            : { diagnostic, code: "STREAM_INTERRUPTED", classification: "transport", acceptance: "uncertain", retryable: true, replaySafe: true },
    });
}
