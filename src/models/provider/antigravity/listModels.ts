/**
 * List the signed-in Antigravity account's Gemini and Claude catalogue choices
 *
 * listModels adapter of the antigravity provider. Without a usable sign-in fails LOGIN_REQUIRED before any
 * request. Otherwise resolves the account project (models.provider.antigravity.project) and posts
 * `fetchAvailableModels` with that project over the connection transport, then maps the inventory with
 * models.provider.antigravity.mapModels. An empty result is a successful empty catalogue, not an error.
 * @param opts.conn Resolved antigravity connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.ModelInfo[]> {
    const { conn } = opts;
    const project = await ctx.fns.models.provider.antigravity.project({ conn });
    const response = await ctx.fns.models.provider.antigravity.api({ conn, method: "fetchAvailableModels", body: { project } });
    return ctx.fns.models.provider.antigravity.mapModels({ response });
}
