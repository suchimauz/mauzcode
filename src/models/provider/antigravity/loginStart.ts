/**
 * Start an Antigravity sign-in for the connection
 *
 * login action of the antigravity provider. Returns the public flow with the authorization link and the
 * account-restriction warning; see models.provider.antigravity.login.
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
    return ctx.fns.models.provider.antigravity.login({ conn: opts.conn, op: "start" });
}
