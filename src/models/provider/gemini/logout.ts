/**
 * Log a Gemini connection out: fence the login flow, delete tokens and setup, then revoke best-effort
 *
 * logout action of the gemini provider. Under the per-connection credential lock it cancels any login flow (closing its loopback listener) and deletes the stored tokens, project and tier, so a late token exchange can never restore credentials. Afterwards it sends one best-effort revocation of the captured refresh token to Google's revoke endpoint through conn.fetch with a short timeout; a failed or timed-out revocation never restores tokens or fails the logout and is reported only as a safe note.
 * @param opts.conn Resolved gemini connection; its fetch carries the revocation.
 * @param opts.revokeTimeoutMs Revocation timeout. @default 5000 @minimum 1 @maximum 30000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection; its fetch carries the revocation. */
        conn: types.models.ResolvedConnection;
        /** Revocation timeout. @default 5000 @minimum 1 @maximum 30000 */
        revokeTimeoutMs?: number;
    },
): Promise<types.models.ActionValue> {
    const { conn } = opts;
    const k = ctx.fns.models.provider.gemini.constants({});
    const cleared = await ctx.fns.models.provider.gemini.lock({
        connectionId: conn.id,
        run: async () => {
            await ctx.fns.models.provider.gemini.login({ conn, op: "cancel" });
            return ctx.fns.models.provider.gemini.auth({ conn, op: "clear" });
        },
    }) as { refreshToken?: string };
    let note: string | undefined;
    if (cleared.refreshToken) {
        const timeoutMs = Math.min(Math.max(opts.revokeTimeoutMs ?? 5000, 1), 30000);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("revoke timeout")), timeoutMs); });
            const res = await Promise.race([deadline, conn.fetch(k.revokeUrl, {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ token: cleared.refreshToken }).toString(),
                signal: AbortSignal.timeout(timeoutMs),
            })]);
            await res.body?.cancel().catch(() => undefined);
            if (!res.ok) note = "Tokens deleted locally; Google did not confirm revocation (HTTP " + res.status + ")";
        } catch { note = "Tokens deleted locally; Google revocation did not complete"; }
        finally { clearTimeout(timer); }
    }
    return { loggedIn: false, needsLogin: true, ...(note ? { note } : {}) };
}
