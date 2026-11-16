/**
 * Build authenticated Qwen gateway headers for one connection
 *
 * Use inside the qwen provider before any request to api.qwen.ai. Takes a currently valid access token from models.provider.qwen.auth (refreshing through the transport when it expires within 30 s) and returns Authorization Bearer plus the neutral MauzCode User-Agent. Throws LOGIN_REQUIRED without network when no usable login exists. Never log the result.
 * @param opts.conn Resolved qwen connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved qwen connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<Record<string, string>> {
    const k = ctx.fns.models.provider.qwen.constants({});
    const r = await ctx.fns.models.provider.qwen.auth({ conn: opts.conn, op: "token" });
    return { authorization: "Bearer " + r.accessToken!, "user-agent": k.userAgent };
}
