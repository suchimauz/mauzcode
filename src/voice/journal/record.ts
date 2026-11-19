import { randomBytes } from "node:crypto";
/**
 * Record a sanitized terminal voice provider failure.
 *
 * Return a short reference only after persistence. Discard unknown route identifiers, normalize unknown causes and isolate storage failures from dictation.
 * @param opts.provider Resolved provider catalogue identifier.
 * @param opts.model Resolved model identifier from this provider.
 * @param opts.stage Terminal failure phase from the session state.
 * @param opts.cause Normalized failure classification, never an upstream message.
 * @param opts.reason What ended the session, from the closed reason set; anything else is stored as `other`.
 * @param opts.detail WebSocket close code (1000-4999) or lowercase service identifier; any other value is dropped.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved provider catalogue identifier. */
        provider: string;
        /** Resolved model identifier from this provider. */
        model: string;
        /** Terminal failure phase from the session state. */
        stage: string;
        /** Normalized failure classification, never an upstream message. */
        cause: string;
        /** What ended the session, from the closed reason set; anything else is stored as `other`. */
        reason?: string;
        /** WebSocket close code (1000-4999) or lowercase service identifier; any other value is dropped. */
        detail?: string;
    },
): Promise<string | null> {
    try {
        if (!["opening", "streaming", "finishing"].includes(opts.stage)) return null;
        const cause = ["authentication", "rateLimit", "timeout"].includes(opts.cause) ? opts.cause : "unknown";
        const reasons = ["socketClosed", "socketError", "serviceError", "malformedMessage", "sequenceMismatch", "sendFailed", "setupTimeout", "finishTimeout"];
        const reason = opts.reason === undefined ? null : reasons.includes(opts.reason) ? opts.reason : "other";
        const detail = typeof opts.detail === "string" && /^([1-4][0-9]{3}|[a-z][a-z0-9_.]{0,63})$/.test(opts.detail) ? opts.detail : null;
        const def = ctx.state.voice?.providers?.[opts.provider]?.definition;
        const provider = def?.id === opts.provider && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(opts.provider) ? opts.provider : null;
        const model = provider && /^[a-zA-Z0-9][a-zA-Z0-9.:/_-]{0,199}$/.test(opts.model) && def?.models?.some(m => m.id === opts.model) ? opts.model : null;
        for (let attempt = 0; attempt < 3; attempt++) {
            const id = randomBytes(8).toString("hex");
            const result = await ctx.fns.procs.db.run({ sql: "INSERT INTO voice_error_journal (id, created_at, provider, model, stage, cause, reason, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING", params: [id, Date.now(), provider, model, opts.stage, cause, reason, detail] });
            if (result.changes === 1) return id;
        }
    } catch { /* Diagnostics are best effort; do not log raw exceptions. */ }
    return null;
}
