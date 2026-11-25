/**
 * Attach safe pre-response diagnostics to a resolved inference transport
 *
 * Wrap only the per-call fetch of a newly resolved connection, preserving its identity, handoff callbacks, transport flags and existing cancellation or SDK failures. Never retain the URL, request or original transport exception on a public error.
 * @param opts.conn Fresh connection for this generation or compaction call.
 * @param opts.signal Caller cancellation signal, if supplied.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Fresh connection for this generation or compaction call. */
        conn: types.models.ResolvedConnection;
        /** Caller cancellation signal, if supplied. */
        signal?: AbortSignal;
    },
): void {
    const { conn, signal } = opts;
    const fetch = conn.fetch;
    conn.fetch = async (url, init) => {
        try { return await fetch(url, init); }
        catch (cause) {
            const e = (cause ?? {}) as Error & { code?: string; status?: number; retryable?: boolean; noFallback?: boolean; requestSent?: boolean; retryAfterMs?: number; transportFailure?: {kind?: string; phase?: string; retryable?: boolean}; failure?: types.models.FailureInfo };
            if (signal?.aborted || init?.signal?.aborted || e.name === 'AbortError' || e.failure) throw cause;
            const nested = (e.cause as {code?:unknown} | undefined)?.code;
            const diagnostic = ctx.fns.models.inference.providerDiagnostic({ provider: conn.provider, stage: 'transport', transportCode: typeof nested === 'string' ? nested : e.code, request: typeof init?.body === 'string' ? init.body : undefined, secrets: Array.from(new Headers(init?.headers).values()) });
            // Keep retry metadata separate: promoting an unclassified fetch failure to an SDK failure changes replay policy.
            const code = typeof e.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(e.code) ? e.code : undefined;
            const ssh = e.transportFailure;
            throw Object.assign(new Error(diagnostic.summary), { diagnostic, ...(code && {code}), ...(Number.isInteger(e.status) && {status:e.status}), ...(typeof e.retryable === 'boolean' && {retryable:e.retryable}), ...(typeof e.noFallback === 'boolean' && {noFallback:e.noFallback}), ...(typeof e.requestSent === 'boolean' && {requestSent:e.requestSent}), ...(Number.isFinite(e.retryAfterMs) && {retryAfterMs:e.retryAfterMs}), ...(ssh?.kind === 'ssh_transport' && ['before_dispatch','ambiguous','permanent'].includes(ssh.phase ?? '') && {transportFailure:{kind:ssh.kind,phase:ssh.phase,retryable:ssh.retryable}}) });
        }
    };
}
