/**
 * Test a custom endpoint: model discovery, then one minimal generation probe when config.testModel is set.
 *
 * Use from the custom provider's test adapter. Any failure to select the protocol, prepare the endpoint or discover models returns unavailable / models-failed without a probe; a failed probe returns unavailable / generation-failed. Reports available only when every attempted request succeeded. Only conn.fetch is passed to the protocol.
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
    let protocol: types.models.Protocol;
    let endpoint: types.models.ProtocolEndpoint;
    try {
        protocol = ctx.fns.models.protocol.get({ id: String(conn.config.protocol) });
        endpoint = await ctx.fns.models.provider.custom.customEndpoint({ conn, protocol });
        await protocol.listModels(ctx, { fetch: conn.fetch, endpoint });
    } catch {
        return { status: "unavailable", reason: "models-failed", message: "Model discovery request failed", checkedAt: Date.now() };
    }
    const model = conn.config.testModel;
    if (typeof model === "string" && model.trim()) {
        try { await protocol.probe(ctx, { fetch: conn.fetch, endpoint, model }); }
        catch { return { status: "unavailable", reason: "generation-failed", message: "Minimal generation request failed", checkedAt: Date.now() }; }
        return { status: "available", reason: "generation-ok", message: "Model discovery and generation succeeded", checkedAt: Date.now() };
    }
    return { status: "available", reason: "models-ok", message: "Model discovery succeeded; generation was not requested", checkedAt: Date.now() };
}
