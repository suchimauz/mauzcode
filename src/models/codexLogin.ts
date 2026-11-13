/**
 * Start, poll or cancel a native Codex device-code login for one connection
 *
 * Device-code OAuth login of the built-in codex model provider, implemented over HTTP without the codex CLI and without commands on SSH instances; every request goes through conn.fetch (direct, SOCKS proxy or SSH tunnel). op `start` requests a user code, starts background polling (403/404 = pending, 15-minute expiry) and the single, never-retried code-for-token exchange, then stores tokens via models.codexAuth; a new start cancels a previous pending flow. op `status` and `cancel` read or stop the current flow. Returns only flowId, status, verification link, the one-time user code, expiry and a safe message — never tokens, device auth ids or verifiers. Flows are process-local and lost on restart.
 * @param opts.conn Resolved codex connection whose fetch carries every login request; resolve it with a long per-request timeout.
 * @param opts.op Operation to perform.
 * @param opts.intervalMs Override of the server poll interval, for tests. @minimum 1 @maximum 60000
 * @param opts.maxWaitMs Override of the 15-minute login expiry, for tests. @default 900000 @minimum 1 @maximum 900000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved codex connection whose fetch carries every login request; resolve it with a long per-request timeout. */
        conn: types.models.ResolvedConnection;
        /** Operation to perform. */
        op: "start" | "status" | "cancel";
        /** Override of the server poll interval, for tests. @minimum 1 @maximum 60000 */
        intervalMs?: number;
        /** Override of the 15-minute login expiry, for tests. @default 900000 @minimum 1 @maximum 900000 */
        maxWaitMs?: number;
    },
): Promise<{ kind: "device-code"; flowId: string; status: types.models.LoginFlow["status"]; verificationUri?: string; userCode?: string; expiresAt: number; message?: string } | null> {
    return ctx.fns.models.provider.codex.codexLogin(opts);
}
