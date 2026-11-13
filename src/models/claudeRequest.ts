/**
 * Send an allow-listed Claude subscription request through its connection transport.
 *
 * Use for Claude inference, OAuth token exchange and usage requests; reject unsupported destinations before any transport call.
 * @param opts.conn Resolved connection supplying the only permitted network transport.
 * @param opts.url Exact HTTPS Claude subscription endpoint.
 * @param opts.init HTTP method, headers, body and cancellation signal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying the only permitted network transport. */
        conn: types.models.ResolvedConnection;
        /** Exact HTTPS Claude subscription endpoint. */
        url: string;
        /** HTTP method, headers, body and cancellation signal. */
        init: RequestInit;
    },
): Promise<Response> {
    return ctx.fns.models.provider.claude.claudeRequest(opts);
}
