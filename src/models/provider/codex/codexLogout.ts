/**
 * Cancel login and clear stored provider authorization.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
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
    
    
                    await ctx.fns.models.provider.codex.codexLogin({ conn, op: "cancel" });
                    const state = await ctx.fns.models.provider.codex.codexAuth({ conn, op: "clear" });
                    return { loggedIn: state.loggedIn, needsLogin: state.needsLogin };
}
