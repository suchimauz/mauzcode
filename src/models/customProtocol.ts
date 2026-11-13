/**
 * Request custom endpoint model discovery or a minimal generation using its configured wire protocol
 *
 * Use from the custom model provider with a resolved connection. Routes every request through conn.fetch, reads only its apiKey secret, applies protocol-specific authentication and version paths, and rejects failed HTTP requests or malformed model catalogues without exposing response bodies.
 * @param opts.conn Resolved custom connection with baseUrl, protocol, optional testModel and transport-bound fetch.
 * @param opts.operation Discover models or send one minimal generation using config.testModel.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved custom connection with baseUrl, protocol, optional testModel and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
        /** Discover models or send one minimal generation using config.testModel. */
        operation: "models" | "generation";
    },
): Promise<types.models.ModelInfo[]> {
    return ctx.fns.models.provider.custom.customProtocol(opts);
}
