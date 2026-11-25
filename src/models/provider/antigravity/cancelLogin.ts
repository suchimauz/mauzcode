/**
 * Cancel the current Antigravity sign-in
 *
 * cancelLogin action of the antigravity provider. Closes the listener; a later completion of the same flow stores
 * nothing.
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
    return ctx.fns.models.provider.antigravity.login({ conn: opts.conn, op: "cancel" });
}
