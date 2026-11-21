/**
 * Read and store the Google account email after a Gemini login, best-effort
 *
 * Called by models.provider.gemini.login after tokens were stored. Sends one GET to the Google userinfo endpoint with the new bearer token through conn.fetch and saves the reported email in the token store. Any failure returns false and never fails the login. Never logs or returns the token.
 * @param opts.conn Resolved gemini connection; its fetch is the only network path.
 * @param opts.accessToken Freshly issued access token; used only for this request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection; its fetch is the only network path. */
        conn: types.models.ResolvedConnection;
        /** Freshly issued access token; used only for this request. */
        accessToken: string;
    },
): Promise<boolean> {
    const k = ctx.fns.models.provider.gemini.constants({});
    try {
        const res = await opts.conn.fetch(k.userinfoUrl, { method: "GET", headers: { authorization: "Bearer " + opts.accessToken, accept: "application/json" } });
        if (!res.ok) { await res.body?.cancel().catch(() => undefined); return false; }
        const info = await res.json().catch(() => null) as { email?: unknown } | null;
        const email = typeof info?.email === "string" ? info.email.trim() : "";
        if (!email) return false;
        await ctx.fns.models.provider.gemini.auth({ conn: opts.conn, op: "account", account: { email } });
        return true;
    } catch { return false; }
}
