/**
 * Read safe Qwen login status, account summary and the current authorization flow
 *
 * loginStatus action of the qwen provider. Returns login state, token expiry, the safe account summary (name, email, plan) and the public flow view — never tokens or the device code.
 * @param opts.conn Resolved qwen connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved qwen connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.ActionValue> {
    const { conn } = opts;
    const state = await ctx.fns.models.provider.qwen.auth({ conn, op: "status" });
    return { loggedIn: state.loggedIn, needsLogin: state.needsLogin, expiresAt: state.expiresAt, account: state.account, flow: await ctx.fns.models.provider.qwen.login({ conn, op: "status" }) };
}
