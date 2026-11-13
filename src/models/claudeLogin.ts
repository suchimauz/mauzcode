/**
 * Start, inspect, submit or cancel a Claude authorization-code PKCE login.
 *
 * Keeps one process-local ten-minute flow per connection with optional loopback callback and pasted-code fallback. Exchanges each code once through the approved transport, persists encrypted tokens and returns safe public flow metadata. Starting cancels pending flows.
 * @param opts.conn Resolved connection transport for token exchange.
 * @param opts.op Login operation.
 * @param opts.flowId Exact current flow identifier required for submission.
 * @param opts.code Authorization code, code#state or callback URL; never logged or returned.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection transport for token exchange. */
        conn: types.models.ResolvedConnection;
        /** Login operation. */
        op: "start" | "status" | "submit" | "cancel";
        /** Exact current flow identifier required for submission. */
        flowId?: string;
        /** Authorization code, code#state or callback URL; never logged or returned. */
        code?: string;
    },
): Promise<Omit<types.models.LoginFlow, "abort" | "done"> | null> {
    return ctx.fns.models.provider.claude.claudeLogin(opts);
}
