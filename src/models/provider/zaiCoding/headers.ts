/**
 * Build authenticated Z.ai Coding Plan request headers for one connection
 *
 * Use inside the zai-coding provider before any request to api.z.ai. Reads only the connection's apiKey secret and returns Authorization Bearer for both shared protocols, plus x-api-key on an anthropic-protocol connection. Throws a safe VALIDATION error without contacting the network when no key is stored. Never log the result.
 * @param opts.conn Resolved zai-coding connection supplying the apiKey secret.
 * @param opts.protocol Connection protocol; x-api-key is added only for anthropic. @default "openai-chat"
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved zai-coding connection supplying the apiKey secret. */
        conn: types.models.ResolvedConnection;
        /** Connection protocol; x-api-key is added only for anthropic. */
        protocol?: string;
    },
): Promise<Record<string, string>> {
    const _ctx = ctx;
    const key = await opts.conn.secret("apiKey");
    if (!key) throw Object.assign(new Error("Z.ai Coding Plan API key is not configured"), { code: "VALIDATION", status: 400 });
    return {
        authorization: "Bearer " + key,
        ...(opts.protocol === "anthropic" ? { "x-api-key": key } : {}),
    };
}
