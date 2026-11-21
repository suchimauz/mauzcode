/**
 * Read safe Gemini login status, account, Code Assist tier and the current authorization flow
 *
 * loginStatus action of the gemini provider. Returns login state, token expiry, the safe account email, the Code Assist tier name and the public flow view — never tokens, the PKCE verifier or the authorization code.
 * @param opts.conn Resolved gemini connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.ActionValue> {
    const { conn } = opts;
    const state = await ctx.fns.models.provider.gemini.auth({ conn, op: "status" });
    const flow = await ctx.fns.models.provider.gemini.login({ conn, op: "status" });
    const account = state.account || state.tier ? { ...(state.account?.email ? { email: state.account.email } : {}), ...(state.tier?.name ? { plan: state.tier.name } : {}) } : null;
    return { loggedIn: state.loggedIn, needsLogin: state.needsLogin, expiresAt: state.expiresAt, account, flow } as types.models.ActionValue;
}
