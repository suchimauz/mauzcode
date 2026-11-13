/**
 * Read safe login status and the current authorization flow.
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
    
     const s = await ctx.fns.models.provider.claude.claudeAuth({ conn, op: "status" }); return { loggedIn: s.loggedIn, needsLogin: s.needsLogin, expiresAt: s.expiresAt, flow: await ctx.fns.models.provider.claude.claudeLogin({ conn, op: "status" }) };
}
