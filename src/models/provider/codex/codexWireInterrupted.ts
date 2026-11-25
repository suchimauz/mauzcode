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
        /** True only when no response headers were received. */
        noResponse?: boolean;
        /** signal input used by the codex interrupted protocol helper. */
        signal?: AbortSignal;
    },
): Error {
    const { error, signal } = opts;
    
        if ((error as { failure?: unknown })?.failure) return error as Error;
        if (signal?.aborted) return ctx.fns.models.inference.failure({ message: "Codex request cancelled", status: 499, info: { code: "CANCELLED", classification: "cancelled", acceptance: "uncertain", retryable: false, replaySafe: false } });
        const diagnostic = ctx.fns.models.inference.providerDiagnostic({ provider: 'codex', stage: opts.noResponse ? 'transport' : 'stream', transportCode: typeof (error as {code?:unknown})?.code === 'string' ? (error as {code:string}).code : undefined });
        return ctx.fns.models.inference.failure({ message: diagnostic.summary, status: 502, info: { diagnostic, code: "TRANSPORT", classification: "transport", acceptance: "uncertain", retryable: true, replaySafe: false } });
}
