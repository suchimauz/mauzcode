/**
 * Build the SDK failure for a protocol stream that was cut off or malformed
 *
 * Used by every Protocol.stream when the event stream ends before its terminal event, contains invalid JSON or reports an in-stream error event. Returns a retryable, replay-safe transport (or provider for in-stream errors) failure with acceptance uncertain, so models.call does not retry a request the upstream may have processed. The message never includes upstream payloads.
 * @param opts.label Protocol label used in the message.
 * @param opts.reason What went wrong: ended, malformed or error.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Protocol label used in the message. */
        label: string;
        /** What went wrong: ended, malformed or error. */
        reason: "ended" | "malformed" | "error";
    },
): Error {
    const text = { ended: "stream ended before completion", malformed: "stream contained invalid data", error: "stream reported an error" }[opts.reason];
    return ctx.fns.models.inference.failure({
        message: `${opts.label} ${text}`, status: 502,
        info: opts.reason === "error"
            ? { code: "PROVIDER_ERROR", classification: "provider", acceptance: "uncertain", retryable: false, replaySafe: true }
            : { code: "STREAM_INTERRUPTED", classification: "transport", acceptance: "uncertain", retryable: true, replaySafe: true },
    });
}
