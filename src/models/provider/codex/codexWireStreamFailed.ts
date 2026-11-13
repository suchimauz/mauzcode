/**
 * Classify Codex stream error events without exposing unsafe provider text.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** ev input used by the codex streamFailed protocol helper. */
        ev: Record<string, any>;
    },
): Error {
    const { ev } = opts;
    
        const error = (ev.response?.error ?? ev.error ?? (ev.code || ev.message ? { code: ev.code, message: ev.message } : null)) as Record<string, unknown> | null;
        return ctx.fns.models.failure(ctx.fns.models.provider.codex.codexFailure({ phase: "stream", status: 0, error }));
}
