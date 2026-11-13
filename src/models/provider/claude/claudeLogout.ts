/**
 * Cancel login and clear stored provider authorization.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying scoped credentials and transport. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.ActionValue> {
    const { conn } = opts;
    
     await ctx.fns.models.provider.claude.claudeLogin({ conn, op: "cancel" }); const s = await ctx.fns.models.provider.claude.claudeAuth({ conn, op: "clear" }); return { loggedIn: s.loggedIn, needsLogin: s.needsLogin };
}
