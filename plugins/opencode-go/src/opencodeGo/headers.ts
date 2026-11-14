/**
 * Build authenticated OpenCode Go request headers for one connection.
 *
 * Use inside the opencode-go provider before any request to opencode.ai/inference/go. Reads only the connection's apiKey secret and returns Authorization Bearer, the truthful user-agent MauzCode/opencode-go and, when given, x-opencode-session. Throws a safe error without contacting the network when no key is stored. Never log the result.
 * @param opts.conn Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch.
 * @param opts.sessionId Stable conversation id forwarded as x-opencode-session; omit for non-inference reads.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
        /** Stable conversation id forwarded as x-opencode-session; omit for non-inference reads. */
        sessionId?: string;
    },
): Promise<Record<string, string>> {
    const key = await opts.conn.secret("apiKey");
        if (!key) throw Object.assign(new Error("OpenCode Go API key is not configured"), { code: "VALIDATION", status: 400 });
        return {
            authorization: "Bearer " + key,
            "user-agent": "MauzCode/opencode-go",
            ...(opts.sessionId ? { "x-opencode-session": opts.sessionId.slice(0, 200) } : {}),
        };
}
