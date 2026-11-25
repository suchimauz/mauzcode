/**
 * Classify Codex stream error events without exposing unsafe provider text.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Original outgoing request used only to suppress echoed input. */
        request?: unknown;
        /** Request credential and routing values to suppress. */
        secrets?: string[];
        /** ev input used by the codex streamFailed protocol helper. */
        ev: Record<string, unknown>;
    },
): Error {
    const { ev } = opts;
    
        const error = ((ev.response as { error?: unknown } | null)?.error ?? ev.error ?? (ev.code || ev.message ? { code: ev.code, message: ev.message } : null)) as Record<string, unknown> | null;
        const f = ctx.fns.models.provider.codex.codexFailure({ phase: "stream", status: 0, error });
        const diagnostic = ctx.fns.models.inference.providerDiagnostic({ provider: 'codex', stage: 'stream', body: opts.request === undefined ? undefined : { error }, request: opts.request, secrets: opts.secrets });
        return ctx.fns.models.inference.failure({ ...f, message: diagnostic.summary, info: { ...f.info, diagnostic } });
}
