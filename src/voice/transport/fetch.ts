/**
 * Fetch over a voice connection's saved transport
 *
 * Backs `ResolvedConnection.fetch` for provider model discovery and checks. `direct` uses the server's fetch;
 * `socks` and `ssh-tunnel` send the whole exchange through the saved SOCKS5 proxy or a leased pinned SSH tunnel
 * with remote DNS and verified HTTPS for the destination hostname (`socksProxy.request`). Redirects always fail,
 * a routed request requires HTTPS with GET or POST and at most eight MiB of body, and a broken route never falls
 * back to a direct request. Cancellation and the deadline cover setup and the streamed body; a tunnel lease is
 * released exactly once when the body ends, fails or is cancelled. Failures carry `code: "TRANSPORT"` and a fixed
 * message.
 * @param opts.transport Saved transport of the connection.
 * @param opts.url Absolute credential-free HTTP(S) URL.
 * @param opts.init Request options; redirects are refused.
 * @param opts.signal Cancellation through body EOF.
 * @param opts.timeoutMs Total deadline including the body. @default 30000 @minimum 1 @maximum 3600000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Saved transport of the connection. */
        transport: types.voice.TransportSpec;
        /** Absolute credential-free HTTP(S) URL. */
        url: string;
        /** Request options; redirects are refused. */
        init?: RequestInit;
        /** Cancellation through body EOF. */
        signal?: AbortSignal;
        /** Total deadline including the body. @default 30000 @minimum 1 @maximum 3600000 */
        timeoutMs?: number;
    },
): Promise<Response> {
    const fail = (reason: string, cause?: unknown): never => { throw Object.assign(new Error("Voice transport request failed", { cause }), { code: "TRANSPORT", reason }); };
    const timeout = opts.timeoutMs ?? 30000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600000) fail("config");
    let url: URL | undefined;
    try { url = new URL(opts.url); } catch { fail("config"); }
    if (!["http:", "https:"].includes(url!.protocol) || url!.username || url!.password) fail("config");
    const t = opts.transport;
    if (!t || !["direct", "socks", "ssh-tunnel"].includes(t.kind)) fail("config");
    const signals = [opts.signal, opts.init?.signal ?? undefined, AbortSignal.timeout(timeout)].filter((s): s is AbortSignal => !!s);
    const signal = AbortSignal.any(signals);
    if (t.kind === "direct") {
        try { return await globalThis.fetch(url!.href, { ...opts.init, signal, redirect: "error" }); }
        catch (cause) { return fail(signal.aborted ? "cancelled" : "request", cause); }
    }
    if (url!.protocol !== "https:") fail("https-required");
    const request = new Request(url!.href, { ...opts.init, signal, redirect: "error" });
    if (request.method !== "GET" && request.method !== "POST") fail("method");
    const body = request.body ? new Uint8Array(await request.arrayBuffer()) : undefined;
    if (body && body.byteLength > 8 * 1024 * 1024) fail("body-size");
    const route = await ctx.fns.voice.transport.acquire({ transport: t, signal });
    const controller = new AbortController();
    const onRouteLost = () => controller.abort();
    const combined = AbortSignal.any([signal, controller.signal]);
    route.signal?.addEventListener("abort", onRouteLost, { once: true });
    let done = false;
    const finish = () => { if (done) return; done = true; route.signal?.removeEventListener("abort", onRouteLost); route.release(); };
    try {
        return await ctx.fns.socksProxy.request({
            proxy: route.proxy, url: url!.href, method: request.method as "GET" | "POST",
            headers: Object.fromEntries(request.headers), ...(body ? { body } : {}),
            signal: combined, timeoutMs: timeout, onDone: finish,
        });
    } catch (cause) {
        finish();
        return fail(combined.aborted ? "cancelled" : String((cause as { code?: unknown })?.code ?? "request"), cause);
    }
}
