/**
 * Read safe Antigravity sign-in state, the restriction warning and the current flow
 *
 * loginStatus action of the antigravity provider. Reads stored state only and sends no request; never returns
 * tokens, codes or the verifier.
 * @param opts.conn Resolved antigravity connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.ActionValue> {
    const { conn } = opts;
    const s = await ctx.fns.models.provider.antigravity.auth({ conn, op: "status" });
    return { loggedIn: s.loggedIn, needsLogin: s.needsLogin, expiresAt: s.expiresAt, warning: ctx.fns.models.provider.antigravity.constants({}).warning, flow: await ctx.fns.models.provider.antigravity.login({ conn, op: "status" }) };
}
