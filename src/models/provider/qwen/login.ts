/**
 * Start, poll or cancel a Qwen subscription device-code login for one connection
 *
 * OAuth 2.0 device authorization grant (RFC 8628) of the built-in qwen model provider against auth.qwen.ai with the public `qwen-code-cli` client; no PKCE, no local CLI, no callback server and no Qwen Code credential files. Every request goes through conn.fetch (direct, SOCKS proxy or SSH tunnel). op `start` requests a device code, returns the chat.qwen.ai/authorize link with the user code and starts background polling at the server interval: `authorization_pending` keeps polling, `slow_down` adds 5 s for the rest of the flow, 429/5xx/network errors back off no shorter than the interval and any Retry-After, other OAuth errors fail and `expires_in` ends the flow as expired. Tokens are stored under the per-connection credential lock only while the flow is still current and pending, so logout can fence a late poll. After success, userinfo is read best-effort: the safe account summary (name, email, plan) is saved and a default account name (empty-like `qwen`, `default` or the provider label) is renamed to the reported email or name. A new start supersedes a pending flow. op `status` and `cancel` read or stop the current flow. Returns only flowId, status, verification link, the one-time user code, expiry and a safe message — never tokens or the device code. Flows are process-local and lost on restart.
 * @param opts.conn Resolved qwen connection whose fetch carries every login request; resolve it with a long per-request timeout.
 * @param opts.op Operation to perform.
 * @param opts.intervalMs Override of the server poll interval, for tests. @minimum 1 @maximum 60000
 * @param opts.slowDownMs Override of the 5-second slow_down increment, for tests. @minimum 0 @maximum 60000
 * @param opts.maxWaitMs Override of the server-provided expiry, for tests. @minimum 1 @maximum 1800000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved qwen connection whose fetch carries every login request; resolve it with a long per-request timeout. */
        conn: types.models.ResolvedConnection;
        /** Operation to perform. */
        op: "start" | "status" | "cancel";
        /** Override of the server poll interval, for tests. @minimum 1 @maximum 60000 */
        intervalMs?: number;
        /** Override of the 5-second slow_down increment, for tests. @minimum 0 @maximum 60000 */
        slowDownMs?: number;
        /** Override of the server-provided expiry, for tests. @minimum 1 @maximum 1800000 */
        maxWaitMs?: number;
    },
): Promise<{ kind: "device-code"; flowId: string; status: types.models.LoginFlow["status"]; verificationUri?: string; userCode?: string; expiresAt: number; message?: string } | null> {
    const conn = opts.conn;
    const k = ctx.fns.models.provider.qwen.constants({});
    ctx.state.models ??= {};
    const flows = (ctx.state.models.loginFlows ??= {});
    const view = (f: types.models.LoginFlow | undefined) => f ? { kind: "device-code" as const, flowId: f.flowId, status: f.status, verificationUri: f.verificationUri, userCode: f.userCode, expiresAt: f.expiresAt, ...(f.message ? { message: f.message } : {}) } : null;
    const form = { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": k.userAgent };
    if (opts.op === "status") {
        const f = flows[conn.id];
        if (f && f.status === "pending" && Date.now() >= f.expiresAt) { f.status = "expired"; f.message = "Login code expired"; f.abort.abort(); }
        return view(f);
    }
    if (opts.op === "cancel") {
        const f = flows[conn.id];
        if (f && f.status === "pending") { f.status = "failed"; f.message = "Login cancelled"; f.abort.abort(); }
        return view(f);
    }
    // op === "start": supersede any previous pending flow first.
    const prev = flows[conn.id];
    if (prev?.status === "pending") { prev.status = "failed"; prev.message = "Superseded by a new login"; prev.abort.abort(); }
    const res = await conn.fetch(k.deviceCodeUrl, { method: "POST", headers: form, body: new URLSearchParams({ client_id: k.clientId, scope: k.scope }).toString() });
    if (!res.ok) { await res.body?.cancel().catch(() => undefined); throw Object.assign(new Error("Qwen device code request failed with HTTP " + res.status), { code: "LOGIN_FAILED", status: 502 }); }
    const dc = await res.json().catch(() => null) as { device_code?: unknown; user_code?: unknown; verification_uri?: unknown; verification_uri_complete?: unknown; expires_in?: unknown; interval?: unknown } | null;
    const deviceCode = typeof dc?.device_code === "string" ? dc.device_code : "";
    const userCode = typeof dc?.user_code === "string" ? dc.user_code : "";
    if (!deviceCode || !userCode) throw Object.assign(new Error("Qwen device code response is incomplete"), { code: "LOGIN_FAILED", status: 502 });
    const seconds = Number(dc?.interval);
    let intervalMs = opts.intervalMs ?? (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) * 1000 : 5000);
    const expiresIn = Number(dc?.expires_in);
    const ttl = opts.maxWaitMs ?? (Number.isFinite(expiresIn) && expiresIn > 0 ? Math.min(expiresIn, 1800) * 1000 : 15 * 60_000);
    const complete = typeof dc?.verification_uri_complete === "string" && /^https:\/\//.test(dc.verification_uri_complete) ? dc.verification_uri_complete : undefined;
    const verificationUri = userCode ? k.authorizeUrl + "?" + new URLSearchParams({ user_code: userCode, client: "cli" }).toString() : complete;
    const flow: types.models.LoginFlow = { kind: "device-code", flowId: crypto.randomUUID(), status: "pending", verificationUri, userCode, expiresAt: Date.now() + ttl, abort: new AbortController() };
    flows[conn.id] = flow;
    const signal = flow.abort.signal;
    const current = () => flows[conn.id] === flow && flow.status === "pending" && !signal.aborted;
    const finish = (status: "succeeded" | "failed" | "expired", message: string) => { if (flow.status === "pending") { flow.status = status; flow.message = message; } };
    const sleep = (ms: number) => new Promise<void>(resolve => { const t = setTimeout(resolve, ms); signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true }); });
    const retryAfter = (r: Response) => {
        const raw = r.headers.get("retry-after")?.trim();
        if (!raw) return 0;
        if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw) * 1000;
        const at = Date.parse(raw);
        return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
    };
    flow.done = (async () => {
        try {
            let wait = intervalMs, failures = 0;
            let tokens: { access_token: string; refresh_token?: string; expires_in?: number } | null = null;
            while (current()) {
                if (Date.now() >= flow.expiresAt) { finish("expired", "Login code expired"); flow.abort.abort(); return; }
                await sleep(Math.min(wait, Math.max(0, flow.expiresAt - Date.now())));
                if (!current()) return;
                if (Date.now() >= flow.expiresAt) { finish("expired", "Login code expired"); flow.abort.abort(); return; }
                let poll: Response;
                try {
                    poll = await conn.fetch(k.tokenUrl, {
                        method: "POST", headers: form, signal,
                        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: k.clientId, device_code: deviceCode }).toString(),
                    });
                } catch (error) {
                    if (!current()) return;
                    failures++; wait = Math.max(intervalMs, Math.min(60_000, intervalMs * 2 ** Math.min(failures, 4)));
                    continue;
                }
                if (poll.ok) {
                    const body = await poll.json().catch(() => null) as Record<string, unknown> | null;
                    if (!body || typeof body.access_token !== "string" || !body.access_token) { finish("failed", "Qwen token response is incomplete"); return; }
                    tokens = { access_token: body.access_token, ...(typeof body.refresh_token === "string" ? { refresh_token: body.refresh_token } : {}), ...(typeof body.expires_in === "number" ? { expires_in: body.expires_in } : {}) };
                    break;
                }
                if (poll.status === 429 || poll.status >= 500) {
                    const hint = retryAfter(poll);
                    await poll.body?.cancel().catch(() => undefined);
                    failures++; wait = Math.max(intervalMs, hint, Math.min(60_000, intervalMs * 2 ** Math.min(failures, 4)));
                    continue;
                }
                const err = await poll.json().catch(() => null) as { error?: unknown } | null;
                const code = typeof err?.error === "string" ? err.error : "";
                failures = 0;
                if (code === "authorization_pending") { wait = intervalMs; continue; }
                if (code === "slow_down") { intervalMs += opts.slowDownMs ?? 5000; wait = intervalMs; continue; }
                if (code === "expired_token") { finish("expired", "Login code expired"); return; }
                finish("failed", code === "access_denied" ? "Login was denied" : "Qwen authorization failed" + (/^[a-z_]{1,40}$/.test(code) ? " (" + code + ")" : " with HTTP " + poll.status));
                return;
            }
            if (!tokens) return;
            // Persist only while this flow is still current; logout invalidates flows under the same lock.
            const stored = await ctx.fns.models.provider.qwen.lock({
                connectionId: conn.id,
                run: async () => {
                    if (!current()) return false;
                    await ctx.fns.models.provider.qwen.auth({ conn, op: "store", tokens: tokens! });
                    finish("succeeded", "Logged in");
                    return true;
                },
            });
            if (stored !== true) return;
            await ctx.fns.models.provider.qwen.account({ conn, accessToken: tokens.access_token }).catch(() => undefined);
        } catch (error) {
            if (flow.status === "pending") finish("failed", signal.aborted ? "Login cancelled" : ctx.fns.models.connections.safeMessage({ message: error, fallback: "Login failed" }));
        }
    })();
    flow.done.catch(() => undefined);
    return view(flow);
}
