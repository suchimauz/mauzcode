type AntigravityFlow = {
    flowId: string; status: "pending" | "succeeded" | "failed" | "expired"; authorizationUrl: string; expiresAt: number; message?: string;
    verifier: string; state: string; busy: boolean; consumed: boolean; abort: AbortController;
    server?: { stop: (force?: boolean) => unknown }; timer?: ReturnType<typeof setTimeout>;
};
/**
 * Start, inspect, submit or cancel an Antigravity Google sign-in for one connection
 *
 * Authorization code with S256 PKCE, random single-use state and offline access, using the Antigravity public
 * client and its fixed redirect `http://localhost:51121/oauth-callback`. op `start` replaces any earlier flow of the
 * connection and returns the authorization link plus the account-restriction warning; with `loopback` it also
 * tries a best-effort listener on 127.0.0.1 at the redirect port. op `submit` takes the full redirect address the
 * browser landed on (pasted from another machine) for the current flowId. Both paths share one completion that
 * accepts only an address whose scheme, host, port and path equal the expected redirect and that carries a code and
 * the flow's state, while the flow is pending, unexpired and not consumed; the first accepted address consumes the
 * flow, so the code is exchanged at most once. A rejected address sends nothing and leaves the flow pending.
 * Token requests go through the connection transport; the grant is stored under the credential lock only while
 * the flow is still current, so cancel or logout fences a late exchange. Flows last ten minutes and close their
 * listener on success, failure, expiry, cancel or replacement. Returns only the public flow view — never tokens,
 * codes, the verifier or the redirect address.
 * @param opts.conn Resolved antigravity connection whose fetch carries every token request.
 * @param opts.op Login operation.
 * @param opts.flowId Exact current flow identifier required for submission.
 * @param opts.redirect Pasted redirect address; never logged or returned.
 * @param opts.loopback Try to start the loopback listener on start. @default true
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection whose fetch carries every token request. */
        conn: types.models.ResolvedConnection;
        /** Login operation. */
        op: "start" | "status" | "submit" | "cancel";
        /** Exact current flow identifier required for submission. */
        flowId?: string;
        /** Pasted redirect address; never logged or returned. */
        redirect?: string;
        /** Try to start the loopback listener on start. @default true */
        loopback?: boolean;
    },
): Promise<(Omit<types.models.LoginFlow, "abort" | "done"> & { warning?: string }) | null> {
    const { conn, op } = opts;
    ctx.state.models ??= {};
    const state = ctx.state.models as typeof ctx.state.models & { antigravityLogin?: Record<string, AntigravityFlow> };
    const flows = (state.antigravityLogin ??= {});
    const k = ctx.fns.models.provider.antigravity.constants({});
    const view = (f?: AntigravityFlow) => f ? {
        flowId: f.flowId, kind: "authorization-code" as const, status: f.status, authorizationUrl: f.authorizationUrl,
        callbackListening: !!f.server, expiresAt: f.expiresAt, warning: k.warning, ...(f.message ? { message: f.message } : {}),
    } : null;
    const close = (f: AntigravityFlow) => {
        clearTimeout(f.timer);
        // Graceful stop: no new connections, and a callback response in flight is still delivered.
        try { void f.server?.stop(false); } catch { /* already stopped */ }
        f.server = undefined;
    };
    const finish = (f: AntigravityFlow, status: AntigravityFlow["status"], message: string) => {
        if (f.status !== "pending") return;
        f.status = status; f.message = message; f.verifier = ""; f.state = "";
        if (status !== "succeeded") f.abort.abort();
        close(f);
    };
    let flow = flows[conn.id];
    if (flow?.status === "pending" && flow.expiresAt <= Date.now()) finish(flow, "expired", "Login expired");
    if (op === "status") return view(flow);
    if (op === "cancel") { if (flow) finish(flow, "failed", "Login cancelled"); return view(flow); }

    const complete = async (f: AntigravityFlow, address: string): Promise<{ ok: boolean; message: string }> => {
        if (f.expiresAt <= Date.now()) finish(f, "expired", "Login expired");
        if (f.consumed || f.busy) return { ok: false, message: "This sign-in response was already used" };
        if (f.status !== "pending") return { ok: false, message: f.status === "expired" ? "Login expired; start again" : "This login is no longer active" };
        let u: URL, expected: URL;
        try { u = new URL(address.trim()); expected = new URL(k.redirectUri); } catch { return { ok: false, message: "Paste the full address from the browser's address bar" }; }
        const port = (x: URL) => x.port || (x.protocol === "https:" ? "443" : "80");
        if (u.protocol !== expected.protocol || u.hostname !== expected.hostname || port(u) !== port(expected) || u.pathname !== expected.pathname) return { ok: false, message: "The address is not the expected sign-in redirect" };
        const code = u.searchParams.get("code") ?? "", returned = u.searchParams.get("state") ?? "";
        if (!code) return { ok: false, message: "The address has no authorization code" };
        if (!returned || returned !== f.state) return { ok: false, message: "The address belongs to another sign-in" };
        f.consumed = true; f.busy = true;
        let tokens: Record<string, unknown> | null = null;
        try {
            const res = await ctx.fns.models.provider.antigravity.request({ conn, url: k.tokenUrl, init: {
                method: "POST", signal: f.abort.signal,
                headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
                body: new URLSearchParams({ grant_type: "authorization_code", client_id: k.clientId, client_secret: k.clientSecret, code, redirect_uri: k.redirectUri, code_verifier: f.verifier }).toString(),
            } });
            if (!res.ok) { await res.body?.cancel().catch(() => undefined); finish(f, "failed", "Google rejected the sign-in; start again"); return { ok: false, message: "Google rejected the sign-in; start again" }; }
            tokens = await res.json().catch(() => null) as Record<string, unknown> | null;
        } catch {
            finish(f, "failed", f.abort.signal.aborted ? "Login cancelled" : "Token exchange failed; start again");
            return { ok: false, message: f.message ?? "Token exchange failed" };
        }
        const stored = await ctx.fns.models.provider.antigravity.lock({
            connectionId: conn.id,
            run: async () => {
                if (flows[conn.id] !== f || f.status !== "pending" || f.abort.signal.aborted) return false;
                try { await ctx.fns.models.provider.antigravity.auth({ conn, op: "store", tokens: tokens ?? {} }); }
                catch { finish(f, "failed", "Google token response is incomplete; start again"); return false; }
                finish(f, "succeeded", "Logged in");
                return true;
            },
        });
        return stored === true ? { ok: true, message: "Logged in" } : { ok: false, message: f.message ?? "This login is no longer active" };
    };

    if (op === "submit") {
        if (!flow || opts.flowId !== flow.flowId) throw Object.assign(new Error("Login flow not found"), { status: 409 });
        const result = await complete(flow, opts.redirect ?? "");
        const v = view(flow)!;
        return result.ok ? v : { ...v, message: result.message };
    }

    // op === "start": replace any earlier flow and close its listener first.
    if (flow) finish(flow, "failed", "Login replaced");
    const random = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const verifier = random(), oauthState = random();
    const challenge = new Bun.CryptoHasher("sha256").update(verifier).digest("base64url");
    const authorizationUrl = k.authorizeUrl + "?" + new URLSearchParams({
        client_id: k.clientId, response_type: "code", redirect_uri: k.redirectUri, scope: k.scopes.join(" "),
        code_challenge: challenge, code_challenge_method: "S256", state: oauthState, access_type: "offline", prompt: "consent",
    }).toString();
    const active: AntigravityFlow = { flowId: crypto.randomUUID(), status: "pending", authorizationUrl, expiresAt: Date.now() + k.loginTtlMs, verifier, state: oauthState, busy: false, consumed: false, abort: new AbortController() };
    flows[conn.id] = active;
    active.timer = setTimeout(() => finish(active, "expired", "Login expired"), k.loginTtlMs);
    (active.timer as { unref?: () => void }).unref?.();
    const redirect = new URL(k.redirectUri);
    if (opts.loopback !== false && redirect.protocol === "http:" && ["localhost", "127.0.0.1"].includes(redirect.hostname)) {
        try {
            active.server = Bun.serve({
                hostname: "127.0.0.1", port: Number(redirect.port || 80),
                fetch: async request => {
                    const u = new URL(request.url);
                    if (request.method !== "GET" || u.pathname !== redirect.pathname) return new Response("Not found", { status: 404 });
                    // The listener sees 127.0.0.1; compare the redirect the browser was sent to.
                    const result = await complete(active, k.redirectUri + u.search);
                    return new Response(result.ok ? "Login complete. Return to MauzCode." : "Login did not complete. Return to MauzCode.", { status: result.ok ? 200 : 400, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
                },
            });
        } catch { active.server = undefined; }
    }
    if (!active.server) active.message = "Paste the address your browser lands on after sign-in";
    return view(active);
}
