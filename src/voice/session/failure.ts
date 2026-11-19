/**
 * Build one carried failure with a closed session code and its fixed sentence
 *
 * Use instead of throwing a bare `Error` so every failure that crosses the session boundary carries a
 * `types.voice.ErrorCode` and one fixed public sentence. The thrown message is already safe to log or forward: it
 * never repeats a provider's own text.
 * @param opts.code Closed session error code.
 * @param opts.retryable Whether the same call may succeed later. @default false
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Closed session error code. */
        code: types.voice.ErrorCode;
        /** Whether the same call may succeed later. @default false */
        retryable?: boolean;
    },
): Error & { code: types.voice.ErrorCode; retryable: boolean } {
    return Object.assign(new Error(ctx.fns.voice.session.message({ code: opts.code })), {
        code: opts.code,
        retryable: opts.retryable ?? false,
    });
}
