/**
 * Open a WebSocket over a voice connection's saved transport
 *
 * Backs `ResolvedConnection.openWebSocket` for provider checks and live sessions. Returns at once a
 * `BoundWebSocket` in the CONNECTING state, like the `WebSocket` constructor. `direct` uses the server's native
 * client with certificate verification. `socks` and `ssh-tunnel` resolve the saved proxy or lease a pinned SSH
 * tunnel, ask it to connect to the destination by hostname (remote DNS), perform TLS for that hostname with
 * certificate and identity verification, then upgrade on that same stream and carry every later frame over it:
 * there is no second dial and never a direct fallback. Routed sockets require `wss:`. Redirects and every
 * non-101 answer are refused with a fixed `Expected 101 status code: <status>` error. The setup deadline and
 * `signal` cancel the proxy, tunnel, TLS and upgrade steps; `signal` also ends an open socket. The tunnel lease is
 * released exactly once when the socket closes, fails, is terminated or is cancelled, including a lease that only
 * arrives after cancellation. Error events never carry upstream payloads, URLs or credentials.
 * @param opts.transport Saved transport of the connection.
 * @param opts.url Absolute credential-free `wss:` URL (`ws:` only for direct).
 * @param opts.headers Extra handshake headers; framing and upgrade headers are reserved.
 * @param opts.protocols Optional subprotocols.
 * @param opts.signal Cancels setup and ends the socket.
 * @param opts.timeoutMs Deadline for route setup, TLS and upgrade. @default 30000 @minimum 1 @maximum 600000
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Saved transport of the connection. */
        transport: types.voice.TransportSpec;
        /** Absolute credential-free `wss:` URL (`ws:` only for direct). */
        url: string;
        /** Extra handshake headers; framing and upgrade headers are reserved. */
        headers?: Record<string, string>;
        /** Optional subprotocols. */
        protocols?: string[];
        /** Cancels setup and ends the socket. */
        signal?: AbortSignal;
        /** Deadline for route setup, TLS and upgrade. @default 30000 @minimum 1 @maximum 600000 */
        timeoutMs?: number;
    },
): types.voice.BoundWebSocket {
    const configError = (message: string) => Object.assign(new Error(message), { code: "TRANSPORT", reason: "config" });
    let url: URL;
    try { url = new URL(opts.url); } catch { throw configError("Absolute WebSocket URL required"); }
    if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.hash) throw configError("Credential-free WebSocket URL required");
    const t = opts.transport;
    if (!t || !["direct", "socks", "ssh-tunnel"].includes(t.kind)) throw configError("Unknown voice transport");
    const timeout = opts.timeoutMs ?? 30000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600000) throw configError("Invalid WebSocket setup deadline");
    const headers: Record<string, string> = {};
    const reserved = ["host", "connection", "upgrade", "content-length", "transfer-encoding", "proxy-authorization", "proxy-connection",
        "sec-websocket-key", "sec-websocket-version", "sec-websocket-extensions", "sec-websocket-protocol", "sec-websocket-accept"];
    for (const [key, value] of Object.entries(opts.headers ?? {})) {
        if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || typeof value !== "string" || /[\r\n\0]/.test(value) || reserved.includes(key.toLowerCase())) throw configError("Invalid or reserved WebSocket header");
        headers[key] = value;
    }
    const protocols = opts.protocols ?? [];
    if (!Array.isArray(protocols) || protocols.some(p => typeof p !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(p))) throw configError("Invalid WebSocket subprotocol");

    if (t.kind === "direct") {
        // The native client verifies certificates and does not follow redirects.
        const ws = new WebSocket(url.href, {
            headers,
            ...(protocols.length ? { protocols } : {}),
            tls: { rejectUnauthorized: true },
        } as unknown as string[]) as unknown as types.voice.BoundWebSocket;
        const signal = opts.signal;
        if (signal) {
            const stop = () => { try { ws.terminate(); } catch { /* Already closed. */ } };
            if (signal.aborted) queueMicrotask(stop);
            else {
                signal.addEventListener("abort", stop, { once: true });
                ws.addEventListener("close", () => signal.removeEventListener("abort", stop), { once: true });
            }
        }
        return ws;
    }
    if (url.protocol !== "wss:") throw configError("Routed voice WebSockets require wss");

    const MAX_MESSAGE = 16 * 1024 * 1024;
    const MAX_HEAD = 16 * 1024;
    const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const port = Number(url.port || 443);
    const target = new EventTarget() as types.voice.BoundWebSocket & { readyState: number; bufferedAmount: number };
    let readyState = 0;
    let secure: import("node:tls").TLSSocket | undefined;
    let raw: import("node:net").Socket | undefined;
    let release: (() => void) | undefined;
    let routeSignal: AbortSignal | undefined;
    let setupTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    let closeSent = false;
    let closeCode = 1006;
    let closeReason = "";
    let buffer: Buffer = Buffer.alloc(0);
    let fragments: Buffer[] = [];
    let fragmentType = 0;
    let fragmentSize = 0;
    const setup = new AbortController();
    Object.defineProperty(target, "readyState", { get: () => readyState, enumerable: true });
    Object.defineProperty(target, "bufferedAmount", { get: () => secure?.writableLength ?? 0, enumerable: true });

    const onRouteLost = () => fail("Voice transport route was lost");
    const onAbort = () => fail("Voice transport cancelled");
    // One terminal path: every resource this socket owns is released here, exactly once.
    const finish = (code: number, reason: string, wasClean: boolean) => {
        if (finished) return;
        finished = true;
        readyState = 3;
        clearTimeout(setupTimer); clearTimeout(closeTimer);
        setup.abort();
        opts.signal?.removeEventListener("abort", onAbort);
        routeSignal?.removeEventListener("abort", onRouteLost);
        try { secure?.destroy(); } catch { /* Already gone. */ }
        try { raw?.destroy(); } catch { /* Already gone. */ }
        const lease = release; release = undefined; lease?.();
        buffer = Buffer.alloc(0); fragments = [];
        target.dispatchEvent(new CloseEvent("close", { code, reason, wasClean }));
    };
    function fail(message: string): void {
        if (finished) return;
        target.dispatchEvent(new ErrorEvent("error", { message }));
        finish(1006, "", false);
    }
    const frame = (opcode: number, payload: Buffer): Buffer => {
        const mask = crypto.getRandomValues(new Uint8Array(4));
        const length = payload.length;
        const head = length < 126 ? Buffer.from([0x80 | opcode, 0x80 | length])
            : length < 65536 ? Buffer.from([0x80 | opcode, 0x80 | 126, length >> 8, length & 255])
            : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 0x80 | 127; b.writeBigUInt64BE(BigInt(length), 2); return b; })();
        const body = Buffer.alloc(length);
        for (let i = 0; i < length; i++) body[i] = payload[i]! ^ mask[i & 3]!;
        return Buffer.concat([head, Buffer.from(mask), body]);
    };
    const write = (opcode: number, payload: Buffer) => { secure!.write(frame(opcode, payload)); };
    const sendClose = (code: number, reason = "") => {
        if (closeSent || !secure) return;
        closeSent = true;
        const body = Buffer.alloc(2 + Buffer.byteLength(reason));
        body.writeUInt16BE(code, 0); body.write(reason, 2);
        try { write(8, body); } catch { /* The peer is gone; finish handles it. */ }
    };
    const protocolError = () => { sendClose(1002); fail("Voice WebSocket protocol error"); };

    const onFrames = () => {
        while (!finished) {
            if (buffer.length < 2) return;
            const b0 = buffer[0]!, b1 = buffer[1]!;
            const fin = (b0 & 0x80) !== 0, opcode = b0 & 0x0f;
            if ((b0 & 0x70) !== 0 || (b1 & 0x80) !== 0) return protocolError();
            let length = b1 & 0x7f, offset = 2;
            if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
            else if (length === 127) {
                if (buffer.length < 10) return;
                const big = buffer.readBigUInt64BE(2);
                if (big > BigInt(MAX_MESSAGE)) return protocolError();
                length = Number(big); offset = 10;
            }
            if (length > MAX_MESSAGE) return protocolError();
            if (buffer.length < offset + length) return;
            const payload = Buffer.from(buffer.subarray(offset, offset + length));
            buffer = buffer.subarray(offset + length);
            if (opcode >= 8) {
                if (!fin || length > 125) return protocolError();
                if (opcode === 8) {
                    if (length === 1) return protocolError();
                    closeCode = length >= 2 ? payload.readUInt16BE(0) : 1005;
                    try { closeReason = length > 2 ? new TextDecoder("utf-8", { fatal: true }).decode(payload.subarray(2)) : ""; } catch { return protocolError(); }
                    readyState = 2;
                    sendClose(closeCode === 1005 ? 1000 : closeCode);
                    try { secure?.end(); } catch { /* Closing anyway. */ }
                    finish(closeCode, closeReason, true);
                    return;
                }
                if (opcode === 9) { if (readyState === 1) try { write(10, payload); } catch { /* finish via socket error */ } continue; }
                if (opcode === 10) continue;
                return protocolError();
            }
            if (opcode === 0) { if (!fragmentType) return protocolError(); }
            else if (opcode === 1 || opcode === 2) { if (fragmentType) return protocolError(); fragmentType = opcode; fragmentSize = 0; fragments = []; }
            else return protocolError();
            fragmentSize += payload.length;
            if (fragmentSize > MAX_MESSAGE) return protocolError();
            fragments.push(payload);
            if (!fin) continue;
            const whole = Buffer.concat(fragments);
            const type = fragmentType;
            fragments = []; fragmentType = 0; fragmentSize = 0;
            let data: string | ArrayBuffer;
            if (type === 1) {
                try { data = new TextDecoder("utf-8", { fatal: true }).decode(whole); } catch { sendClose(1007); fail("Voice WebSocket protocol error"); return; }
            } else data = whole.buffer.slice(whole.byteOffset, whole.byteOffset + whole.byteLength) as ArrayBuffer;
            // Closing locally stops delivery; a message dispatched to a closing socket is still ordered.
            if (readyState === 1 || readyState === 2) target.dispatchEvent(new MessageEvent("message", { data }));
        }
    };

    Object.assign(target, {
        send(data: string | ArrayBuffer | ArrayBufferView) {
            if (readyState !== 1) throw new DOMException("WebSocket is not open", "InvalidStateError");
            if (typeof data === "string") write(1, Buffer.from(data, "utf8"));
            else if (data instanceof ArrayBuffer) write(2, Buffer.from(data));
            else write(2, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
        },
        close(code = 1000, reason = "") {
            if (finished || readyState >= 2) return;
            if (readyState === 0) { fail("Voice WebSocket closed before it opened"); return; }
            readyState = 2;
            sendClose(code, reason.slice(0, 120));
            // Bound the close handshake: a peer that ignores our close cannot retain the socket or the lease.
            closeTimer = setTimeout(() => finish(1006, "", false), 1000);
        },
        terminate() { if (!finished) finish(1006, "", false); },
    });

    opts.signal?.addEventListener("abort", onAbort, { once: true });
    setupTimer = setTimeout(() => fail("Voice WebSocket setup timed out"), timeout);
    void (async () => {
        try {
            if (opts.signal?.aborted) { onAbort(); return; }
            const route = await ctx.fns.voice.transport.acquire({ transport: t, signal: setup.signal });
            if (finished) { route.release(); return; }
            release = route.release;
            routeSignal = route.signal;
            if (routeSignal?.aborted) { onRouteLost(); return; }
            routeSignal?.addEventListener("abort", onRouteLost, { once: true });
            const socket = await ctx.fns.socksProxy.connect({ proxy: route.proxy, host, port, signal: setup.signal, timeoutMs: timeout });
            if (finished) { socket.destroy(); return; }
            raw = socket;
            const tls = await import("node:tls");
            if (finished) return;
            const key = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
            const expected = new Bun.CryptoHasher("sha1").update(key + GUID).digest("base64");
            let verified = false, upgraded = false, head: Buffer = Buffer.alloc(0);
            secure = tls.connect({ socket, servername: host, rejectUnauthorized: true, checkServerIdentity: tls.checkServerIdentity });
            socket.on("error", () => fail(upgraded ? "Voice WebSocket connection lost" : "Voice transport connection failed"));
            secure.on("error", () => fail(verified ? "Voice WebSocket connection lost" : "TLS verification or handshake failed"));
            secure.on("close", () => { if (!finished) fail(upgraded ? "Voice WebSocket connection lost" : "Voice transport connection failed"); });
            secure.once("secureConnect", () => {
                verified = true;
                const lines = [
                    `GET ${url.pathname || "/"}${url.search} HTTP/1.1`,
                    `Host: ${url.host}`,
                    "Upgrade: websocket",
                    "Connection: Upgrade",
                    `Sec-WebSocket-Key: ${key}`,
                    "Sec-WebSocket-Version: 13",
                    ...(protocols.length ? [`Sec-WebSocket-Protocol: ${protocols.join(", ")}`] : []),
                    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
                ];
                secure!.write(lines.join("\r\n") + "\r\n\r\n");
            });
            secure.on("data", (chunk: Buffer) => {
                if (finished) return;
                if (upgraded) { buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk; onFrames(); return; }
                head = Buffer.concat([head, chunk]);
                const end = head.indexOf("\r\n\r\n");
                if (end < 0) { if (head.length > MAX_HEAD) fail("Voice WebSocket upgrade failed"); return; }
                const [statusLine, ...fields] = head.subarray(0, end).toString("latin1").split("\r\n");
                const match = /^HTTP\/1\.[01] (\d{3})(?: |$)/.exec(statusLine ?? "");
                const status = match ? Number(match[1]) : 0;
                // Never follow a redirect and never expose the response: only the status code is reported.
                if (status !== 101) { fail(`WebSocket upgrade failed: Expected 101 status code: ${status || "invalid"}`); return; }
                const response = new Map<string, string>();
                for (const field of fields) {
                    const colon = field.indexOf(":");
                    if (colon > 0) response.set(field.slice(0, colon).trim().toLowerCase(), field.slice(colon + 1).trim());
                }
                const protocol = response.get("sec-websocket-protocol");
                if (response.get("upgrade")?.toLowerCase() !== "websocket" || !/(^|,)\s*upgrade\s*(,|$)/i.test(response.get("connection") ?? "") ||
                    response.get("sec-websocket-accept") !== expected || response.has("sec-websocket-extensions") ||
                    (protocol !== undefined && !protocols.includes(protocol))) { fail("Voice WebSocket upgrade failed"); return; }
                upgraded = true;
                clearTimeout(setupTimer);
                readyState = 1;
                buffer = Buffer.from(head.subarray(end + 4));
                head = Buffer.alloc(0);
                target.dispatchEvent(new Event("open"));
                if (buffer.length) onFrames();
            });
            socket.resume();
        } catch {
            fail(opts.signal?.aborted ? "Voice transport cancelled" : "Voice transport is unavailable");
        }
    })();
    return target;
}
