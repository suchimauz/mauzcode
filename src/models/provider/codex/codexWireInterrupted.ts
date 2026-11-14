/**
 * Preserve structured failures and classify interrupted Codex streams.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** error input used by the codex interrupted protocol helper. */
        error: unknown;
        /** signal input used by the codex interrupted protocol helper. */
        signal?: AbortSignal;
    },
): Error {
    const { error, signal } = opts;
    
        if ((error as { failure?: unknown })?.failure) return error as Error;
        if (signal?.aborted) return ctx.fns.models.inference.failure({ message: "Codex request cancelled", status: 499, info: { code: "CANCELLED", classification: "cancelled", acceptance: "uncertain", retryable: false, replaySafe: false } });
        return ctx.fns.models.inference.failure({ message: "Codex connection failed before a terminal response", status: 502, info: { code: "TRANSPORT", classification: "transport", acceptance: "uncertain", retryable: true, replaySafe: false } });
}
