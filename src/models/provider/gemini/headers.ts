/**
 * Build authenticated Code Assist request headers for a Gemini connection
 *
 * Returns a bearer token from models.provider.gemini.auth (refreshing it first when needed; LOGIN_REQUIRED without a usable login) and the User-Agent `GeminiCLI/<pinned>/<model> (<platform>; <arch>; mauzcode)`. The result holds a credential: pass it only to conn.fetch, never return or log it.
 * @param opts.conn Resolved gemini connection.
 * @param opts.model Model id for the User-Agent. @default "unknown"
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection. */
        conn: types.models.ResolvedConnection;
        /** Model id for the User-Agent. @default "unknown" */
        model?: string;
    },
): Promise<Record<string, string>> {
    const k = ctx.fns.models.provider.gemini.constants({});
    const { accessToken } = await ctx.fns.models.provider.gemini.auth({ conn: opts.conn, op: "token" });
    return {
        authorization: "Bearer " + accessToken,
        "user-agent": "GeminiCLI/" + k.cliVersion + "/" + (opts.model || "unknown") + " (" + process.platform + "; " + process.arch + "; mauzcode)",
    };
}
