/**
 * Check subscription login and provider reachability through the connection transport.
 *
 * Use from custom provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying scoped credentials and transport. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.TestResult> {
    const { conn } = opts;
    
    
            try { await ctx.fns.models.provider.custom.customProtocol({ conn, operation: "models" }); }
            catch { return { status: "unavailable", reason: "models-failed", message: "Model discovery request failed", checkedAt: Date.now() }; }
            if (typeof conn.config.testModel === "string" && conn.config.testModel.trim()) {
                try { await ctx.fns.models.provider.custom.customProtocol({ conn, operation: "generation" }); }
                catch { return { status: "unavailable", reason: "generation-failed", message: "Minimal generation request failed", checkedAt: Date.now() }; }
                return { status: "available", reason: "generation-ok", message: "Model discovery and generation succeeded", checkedAt: Date.now() };
            }
            return { status: "available", reason: "models-ok", message: "Model discovery succeeded; generation was not requested", checkedAt: Date.now() };
}
