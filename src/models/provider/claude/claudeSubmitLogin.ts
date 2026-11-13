/**
 * Validate and submit the authorization code for the matching login flow.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying scoped credentials and transport. */
        conn: types.models.ResolvedConnection;
        /** Provider operation input with existing callback and cancellation semantics. */
        input: types.models.ActionValue;
    },
): Promise<types.models.ActionValue> {
    const { conn, input } = opts;
    
    
                if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.code !== "string" || typeof input.flowId !== "string") throw new Error("Authorization code and flow id are required");
                return ctx.fns.models.provider.claude.claudeLogin({ conn, op: "submit", code: input.code, flowId: input.flowId });
}
