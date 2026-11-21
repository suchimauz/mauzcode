/**
 * Start, inspect, submit or cancel a Gemini Google-account login for one connection
 *
 * OAuth 2.0 authorization-code grant with S256 PKCE, random state and offline access, using Gemini CLI's public installed-app client and the cloud-platform/userinfo scopes. op `start` cancels any earlier flow of the connection, then returns the paste-code authorization link (redirect https://codeassist.google.com/authcode) and, when a 127.0.0.1 loopback listener on a free port with path /oauth2callback can be started, a second `callbackAuthorizationUrl` for a browser on the same machine; both share the verifier and state, and each exchange uses the redirect of its source. op `submit` takes the pasted code (or a URL carrying code and state) for the current flowId. Each flow lasts ten minutes, exchanges at most one code (a busy flag blocks concurrent submissions), and closes its listener when it succeeds, fails, expires, is cancelled or replaced. A loopback callback whose state does not match sends nothing and leaves the flow pending. Every token request goes through conn.fetch; tokens are stored under the credential lock only while the flow is still current and pending, so logout fences a late exchange. After success the Google userinfo email is read best-effort and Code Assist setup runs best-effort (its failure is kept as the flow message). Returns only the public flow view — never tokens, the verifier or the code.
 * @param opts.conn Resolved gemini connection whose fetch carries every token request.
 * @param opts.op Login operation.
 * @param opts.flowId Exact current flow identifier required for submission.
 * @param opts.code Pasted authorization code or URL with code and state; never logged or returned.
 * @param opts.loopback Try to start the loopback callback listener on start. @default true
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection whose fetch carries every token request. */
        conn: types.models.ResolvedConnection;
        /** Login operation. */
        op: "start" | "status" | "submit" | "cancel";
        /** Exact current flow identifier required for submission. */
        flowId?: string;
        /** Pasted authorization code or URL with code and state; never logged or returned. */
        code?: string;
        /** Try to start the loopback callback listener on start. @default true */
        loopback?: boolean;
    },
): Promise<Omit<types.models.LoginFlow, "abort" | "done"> | null> {
    const { conn, op } = opts;
    type Flow = NonNullable<NonNullable<typeof ctx.state.models>["geminiLogin"]>[string];
    ctx.state.models ??= {};
    const flows = (ctx.state.models.geminiLogin ??= {});
    const k = ctx.fns.models.provider.gemini.constants({});
    const view = (f?: Flow): Omit<types.models.LoginFlow, "abort" | "done"> | null => f ? {
        flowId: f.flowId, kind: "authorization-code", status: f.status, authorizationUrl: f.authorizationUrl,
        ...(f.server && f.callbackAuthorizationUrl ? { callbackAuthorizationUrl: f.callbackAuthorizationUrl } : {}),
        callbackListening: !!f.server, expiresAt: f.expiresAt, ...(f.message ? { message: f.message } : {}),
    } : null;
    const close = (f: Flow) => { clearTimeout(f.timer); // Graceful stop: no new connections, and a callback response in flight is still delivered.
        try { void f.server?.stop(false); } catch { /* already stopped */ } f.server = undefined; };
    const finish = (f: Flow, status: Flow["status"], message: string) => {
        if (f.status !== "pending") return;
        f.status = status; f.message = message; f.verifier = ""; f.state = "";
        if (status !== "succeeded") f.abort.abort();
        close(f);
    };
    let flow = flows[conn.id];
    if (flow?.status === "pending" && flow.expiresAt <= Date.now()) finish(flow, "expired", "Login expired");
    if (op === "status") return view(flow);
    if (op === "cancel") { if (flow) finish(flow, "failed", "Login cancelled"); return view(flow); }

    const exchange = async (f: Flow, code: string, redirectUri: string) => {
        if (f.status !== "pending" || f.busy) return view(f);
        if (f.expiresAt <= Date.now()) { finish(f, "expired", "Login expired"); return view(f); }
        f.busy = true;
        let tokens: { access_token: string; refresh_token?: string; expires_in?: number } | null = null;
        try {
            const res = await conn.fetch(k.tokenUrl, {
                method: "POST", signal: f.abort.signal,
                headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
                body: new URLSearchParams({ grant_type: "authorization_code", client_id: k.clientId, client_secret: k.clientSecret, code, redirect_uri: redirectUri, code_verifier: f.verifier }).toString(),
            });
            if (!res.ok) { await res.body?.cancel().catch(() => undefined); finish(f, "failed", "Google rejected the authorization code; start login again"); return view(f); }
            const body = await res.json().catch(() => null) as Record<string, unknown> | null;
            if (!body || typeof body.access_token !== "string" || !body.access_token) { finish(f, "failed", "Google token response is incomplete"); return view(f); }
            tokens = { access_token: body.access_token, ...(typeof body.refresh_token === "string" ? { refresh_token: body.refresh_token } : {}), ...(typeof body.expires_in === "number" ? { expires_in: body.expires_in } : {}) };
        } catch {
            if (f.status === "pending") finish(f, "failed", f.abort.signal.aborted ? "Login cancelled" : "Token exchange failed; start login again");
            return view(f);
        }
        // busy stays set: the flow is single-exchange, and it leaves pending below.
        const stored = await ctx.fns.models.provider.gemini.lock({
            connectionId: conn.id,
            run: async () => {
                if (flows[conn.id] !== f || f.status !== "pending" || f.abort.signal.aborted) return false;
                await ctx.fns.models.provider.gemini.auth({ conn, op: "store", tokens: tokens! });
                finish(f, "succeeded", "Logged in");
                return true;
            },
        });
        if (stored !== true) return view(f);
        f.done = (async () => {
            await ctx.fns.models.provider.gemini.account({ conn, accessToken: tokens!.access_token }).catch(() => false);
            try { await ctx.fns.models.provider.gemini.setup({ conn }); }
            catch (error) { if (flows[conn.id] === f) f.message = "Logged in; Code Assist setup failed: " + ctx.fns.models.connections.safeMessage({ message: error, fallback: "setup failed" }); }
        })();
        f.done.catch(() => undefined);
        return view(f);
    };
    const parse = (input: string) => {
        const raw = input.trim();
        if (/^https?:\/\//i.test(raw)) {
            try { const u = new URL(raw); return { code: u.searchParams.get("code") ?? "", state: u.searchParams.get("state") ?? "" }; } catch { return { code: "", state: "" }; }
        }
        if (raw.startsWith("?") || /(^|&)code=/.test(raw)) { const p = new URLSearchParams(raw.replace(/^\?/, "")); return { code: p.get("code") ?? "", state: p.get("state") ?? "" }; }
        return { code: raw, state: "" };
    };

    if (op === "submit") {
        if (!flow || opts.flowId !== flow.flowId) throw Object.assign(new Error("Login flow not found"), { status: 409 });
        if (flow.status !== "pending" || flow.busy) return view(flow);
        const parsed = parse(opts.code ?? "");
        if (!parsed.code || (parsed.state && parsed.state !== flow.state)) { flow.message = "Invalid authorization code or state"; return view(flow); }
        return exchange(flow, parsed.code, k.pasteRedirectUri);
    }

    // op === "start": replace any earlier flow and close its listener first.
    if (flow) finish(flow, "failed", "Login replaced");
    const random = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const verifier = random(), oauthState = random();
    const challenge = new Bun.CryptoHasher("sha256").update(verifier).digest("base64url");
    const authUrl = (redirectUri: string) => k.authorizeUrl + "?" + new URLSearchParams({
        client_id: k.clientId, response_type: "code", redirect_uri: redirectUri, scope: k.scopes.join(" "),
        access_type: "offline", prompt: "consent", code_challenge: challenge, code_challenge_method: "S256", state: oauthState,
    }).toString();
    const active: Flow = { flowId: crypto.randomUUID(), status: "pending", authorizationUrl: authUrl(k.pasteRedirectUri), expiresAt: Date.now() + k.loginTtlMs, verifier, state: oauthState, busy: false, abort: new AbortController() };
    flows[conn.id] = active;
    active.timer = setTimeout(() => finish(active, "expired", "Login expired"), k.loginTtlMs);
    (active.timer as { unref?: () => void }).unref?.();
    if (opts.loopback !== false) {
        try {
            const server = Bun.serve({
                hostname: "127.0.0.1", port: 0,
                fetch: async request => {
                    const u = new URL(request.url);
                    if (request.method !== "GET" || u.pathname !== k.callbackPath) return new Response("Not found", { status: 404 });
                    const code = u.searchParams.get("code") ?? "", state = u.searchParams.get("state") ?? "";
                    if (active.status !== "pending" || !code || !state || state !== active.state) return new Response("Invalid authorization response", { status: 400, headers: { "cache-control": "no-store" } });
                    await exchange(active, code, active.callbackRedirectUri!);
                    return new Response((active.status as Flow["status"]) === "succeeded" ? "Login complete. Return to MauzCode." : "Login did not complete. Return to MauzCode.", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
                },
            });
            active.server = server;
            active.callbackRedirectUri = "http://127.0.0.1:" + server.port + k.callbackPath;
            active.callbackAuthorizationUrl = authUrl(active.callbackRedirectUri);
        } catch { active.server = undefined; }
    }
    return view(active);
}
