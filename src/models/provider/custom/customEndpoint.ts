/**
 * Build the shared-protocol endpoint (versioned base and complete headers) for a custom connection.
 *
 * Use from the custom provider before calling a protocol's listModels or probe. Validates config.baseUrl through the protocol's baseUrl, reads only the connection's apiKey secret and merges headers case-insensitively through one Headers object in this order: Accept application/json, the protocol defaultHeaders, then its apiKeyHeaders when a key is configured. Throws "Invalid base URL" without echoing the input.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved custom connection supplying config.baseUrl and the apiKey secret. */
        conn: types.models.ResolvedConnection;
        /** Shared protocol selected through models.protocol.get. */
        protocol: types.models.Protocol;
    },
): Promise<types.models.ProtocolEndpoint> {
    const { conn, protocol } = opts;
    const base = protocol.baseUrl(ctx, String(conn.config.baseUrl));
    const headers = new Headers({ Accept: "application/json" });
    for (const [name, value] of Object.entries(protocol.defaultHeaders())) headers.set(name, value);
    const key = await conn.secret("apiKey");
    if (key) for (const [name, value] of Object.entries(protocol.apiKeyHeaders(key))) headers.set(name, value);
    return { base, headers: Object.fromEntries(headers) };
}
