/**
 * Acquire the saved SOCKS5 endpoint of a routed voice connection
 *
 * Internal step of `voice.transport.fetch` and `voice.transport.openWebSocket`. A `socks` route reads the saved
 * proxy (decrypting its credentials only for this call); an `ssh-tunnel` route leases a pooled pinned SSH SOCKS
 * tunnel through `sshProvider.tunnel`. References are resolved again here because the proxy or instance may have
 * been removed after the connection was saved. A lease acquired after cancellation is released at once. The
 * returned `release` frees only this caller's lease and is idempotent. Failures are safe `code: "TRANSPORT"` errors
 * without hosts, credentials or upstream text, and there is never a direct fallback.
 * @param opts.transport Non-direct transport of the connection.
 * @param opts.signal Cancels the wait for the proxy or tunnel.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Non-direct transport of the connection. */
        transport: types.voice.TransportSpec;
        /** Cancels the wait for the proxy or tunnel. */
        signal?: AbortSignal;
    },
): Promise<{ proxy: { host: string; port: number; username?: string; password?: string }; signal?: AbortSignal; release: () => void }> {
    const fail = (reason: string, cause?: unknown): never => { throw Object.assign(new Error("Voice transport is unavailable", { cause }), { code: "TRANSPORT", reason }); };
    const t = opts.transport;
    if (opts.signal?.aborted) fail("cancelled");
    if (t?.kind === "socks") {
        let saved: Awaited<ReturnType<typeof ctx.fns.socksProxy.readSaved>> | undefined;
        try { saved = await ctx.fns.socksProxy.readSaved({ id: t.proxyId }); } catch (cause) { fail("proxy-unavailable", cause); }
        if (opts.signal?.aborted) fail("cancelled");
        const { host, port, username, password } = saved!;
        return { proxy: { host, port, ...(username !== undefined ? { username } : {}), ...(password !== undefined ? { password } : {}) }, release: () => {} };
    }
    if (t?.kind === "ssh-tunnel") {
        let lease: { port: number; signal: AbortSignal; release: () => void } | undefined;
        try { lease = await ctx.fns.sshProvider.tunnel({ instance: t.instance, signal: opts.signal }); } catch (cause) { fail(opts.signal?.aborted ? "cancelled" : "tunnel-unavailable", cause); }
        let released = false;
        const release = () => { if (!released) { released = true; lease!.release(); } };
        // A lease that arrives after cancellation belongs to nobody: give it back immediately.
        if (opts.signal?.aborted) { release(); fail("cancelled"); }
        return { proxy: { host: "127.0.0.1", port: lease!.port }, signal: lease!.signal, release };
    }
    return fail("not-routed");
}
