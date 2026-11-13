/**
 * Manage encrypted Claude subscription tokens with non-replayable rotating refresh.
 *
 * Use status for safe metadata, token internally, store after login, markLogin after rejection, clear for logout. Refresh uses the connection transport and durably marks uncertain outcomes before sending; never expose token results.
 * @param opts.conn Resolved connection supplying the network transport.
 * @param opts.op Credential operation.
 * @param opts.tokens OAuth response required for store, with refresh token and positive expiry.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying the network transport. */
        conn: types.models.ResolvedConnection;
        /** Credential operation. */
        op: "status" | "token" | "store" | "markLogin" | "clear";
        /** OAuth response required for store, with refresh token and positive expiry. */
        tokens?: {access_token:string;refresh_token?:string;expires_in?:number};
        /** Pending login abort signal; cancellation rolls back a serialized store before it completes. */
        signal?: AbortSignal;
    },
): Promise<{loggedIn:boolean;needsLogin:boolean;expiresAt:number|null;accessToken?:string}> {
    return ctx.fns.models.provider.claude.claudeAuth(opts);
}
