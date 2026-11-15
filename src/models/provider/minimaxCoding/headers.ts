/**
 * Build authenticated MiniMax M Plan request headers for one connection
 *
 * Use inside the minimax-coding provider before any request to MiniMax. Reads only the connection's apiKey secret and returns x-api-key for the Anthropic-compatible gateway (the only header that gateway accepts, default) or Authorization Bearer for the token-plan quota endpoint. Throws a safe VALIDATION error without contacting the network when no key is stored. Never log the result.
 * @param opts.conn Resolved minimax-coding connection supplying the apiKey secret.
 * @param opts.auth Header the destination endpoint authenticates with. @default "x-api-key"
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved minimax-coding connection supplying the apiKey secret. */
        conn: types.models.ResolvedConnection;
        /** Header the destination endpoint authenticates with. @default "x-api-key" */
        auth?: "x-api-key" | "bearer";
    },
): Promise<Record<string, string>> {
    const _ctx = ctx;
    const key = await opts.conn.secret("apiKey");
    if (!key) throw Object.assign(new Error("MiniMax M Plan API key is not configured"), { code: "VALIDATION", status: 400 });
    return opts.auth === "bearer" ? { authorization: "Bearer " + key } : { "x-api-key": key };
}
