/**
 * Log an Antigravity connection out locally
 *
 * logout action of the antigravity provider. Under the per-connection credential lock it cancels any sign-in flow
 * and deletes the stored grant, project and cached model list, so a late token exchange or refresh cannot restore
 * the account. Sends no request.
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
    await ctx.fns.models.provider.antigravity.lock({
        connectionId: conn.id,
        run: async () => {
            await ctx.fns.models.provider.antigravity.login({ conn, op: "cancel" });
            return ctx.fns.models.provider.antigravity.auth({ conn, op: "clear" });
        },
    });
    return { loggedIn: false, needsLogin: true };
}
