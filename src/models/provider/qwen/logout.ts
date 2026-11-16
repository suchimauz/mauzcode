/**
 * Log a Qwen connection out: fence the login flow, delete tokens, then revoke best-effort
 *
 * logout action of the qwen provider. Under the per-connection credential lock it cancels and invalidates any active login flow and deletes the stored tokens, so a late device-code poll can never restore credentials. Afterwards it sends one best-effort revocation of the captured refresh token to auth.qwen.ai /api/oauth/revoke through conn.fetch with a short timeout; a failed or timed-out revocation never restores tokens or fails the logout and is reported only as a safe note.
 * @param opts.conn Resolved qwen connection; its fetch carries the revocation.
 * @param opts.revokeTimeoutMs Revocation timeout. @default 5000 @minimum 1 @maximum 30000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved qwen connection; its fetch carries the revocation. */
        conn: types.models.ResolvedConnection;
        /** Revocation timeout. @default 5000 @minimum 1 @maximum 30000 */
        revokeTimeoutMs?: number;
    },
): Promise<types.models.ActionValue> {
    const { conn } = opts;
    const k = ctx.fns.models.provider.qwen.constants({});
    const cleared = await ctx.fns.models.provider.qwen.lock({
        connectionId: conn.id,
        run: async () => {
            const flows = ctx.state.models?.loginFlows ?? {};
            const f = flows[conn.id];
            if (f && f.status === "pending") { f.status = "failed"; f.message = "Login cancelled"; f.abort.abort(); }
            return ctx.fns.models.provider.qwen.auth({ conn, op: "clear" });
        },
    }) as { refreshToken?: string };
    let note: string | undefined;
    if (cleared.refreshToken) {
        const timeoutMs = opts.revokeTimeoutMs ?? 5000;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("revoke timeout")), timeoutMs); });
            const res = await Promise.race([deadline, conn.fetch(k.revokeUrl, {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": k.userAgent },
                body: new URLSearchParams({ token: cleared.refreshToken, token_type_hint: "refresh_token", client_id: k.clientId }).toString(),
                signal: AbortSignal.timeout(timeoutMs),
            })]);
            await res.body?.cancel().catch(() => undefined);
            if (!res.ok) note = "Tokens deleted locally; Qwen did not confirm revocation (HTTP " + res.status + ")";
        } catch { note = "Tokens deleted locally; Qwen revocation did not complete"; }
        finally { clearTimeout(timer); }
    }
    return { loggedIn: false, needsLogin: true, ...(note ? { note } : {}) };
}
