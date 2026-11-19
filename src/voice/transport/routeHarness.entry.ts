/**
 * Child-process harness for the routed voice transport integration test.
 *
 * Runs with NODE_EXTRA_CA_CERTS pointing at a throwaway CA, so the production verifier stays untouched in the
 * parent. It starts a TLS destination (`Bun.serve`, certificate for `voice.test` and `localhost`) serving HTTP,
 * a redirect, a refused upgrade and a minimal fake OpenAI Realtime WebSocket; a SOCKS5 proxy that records every
 * requested destination and forwards it to that server; and a fake pooled SSH tunnel whose leases are counted. It
 * drives the real `voice.transport.*` functions and the real OpenAI Realtime adapter, then prints one JSON line of
 * observations. Nothing here touches an external service or a real credential.
 */
import net from "node:net";
import acquire from "./acquire";
import routedFetch from "./fetch";
import openWebSocket from "./openWebSocket";
import connect from "../../socksProxy/connect";
import request from "../../socksProxy/request";
import transportError from "../../socksProxy/transportError";
import provider from "../$voiceProvider_openai-realtime";

const [keyPath, certPath] = process.argv.slice(2) as [string, string];
const KEY = "fake-route-voice-key";
const PROXY_ID = "00000000-0000-4000-8000-000000000001";

// ---- destination -------------------------------------------------------------------------------------------
type Wire = { path: string; auth: string | null; received: Record<string, any>[] };
const sessions: Wire[] = [];
let destinationHits = 0;
const server = Bun.serve<Wire>({
    hostname: "127.0.0.1", port: 0,
    tls: { key: Bun.file(keyPath), cert: Bun.file(certPath) },
    fetch(req, srv) {
        destinationHits++;
        const url = new URL(req.url);
        if (url.pathname === "/models") return Response.json({ host: req.headers.get("host"), models: ["live"] });
        if (url.pathname === "/redirect" || url.pathname === "/ws-redirect") return new Response(null, { status: 302, headers: { location: "https://elsewhere.invalid/" } });
        if (url.pathname.endsWith("/realtime") || url.pathname === "/echo") {
            const wire: Wire = { path: url.pathname + url.search, auth: req.headers.get("authorization"), received: [] };
            if (srv.upgrade(req, { data: wire })) { sessions.push(wire); return; }
        }
        return new Response("nope", { status: 404 });
    },
    websocket: {
        message(ws, data) {
            const message = JSON.parse(String(data)) as Record<string, any>;
            ws.data.received.push(message);
            if (ws.data.path === "/echo") { ws.send(JSON.stringify({ echo: message })); return; }
            if (message.type === "session.update") ws.send(JSON.stringify({ type: "session.updated", session: { type: "transcription" } }));
            if (message.type === "input_audio_buffer.commit") {
                ws.send(JSON.stringify({ type: "input_audio_buffer.committed", item_id: "item-1", previous_item_id: null }));
                ws.send(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", item_id: "item-1", transcript: "routed hello" }));
            }
        },
    },
});

// ---- SOCKS5 proxy (records destinations, forwards everything to the destination server) -------------------
const dials: string[] = [];
let proxyMode: "forward" | "stall" | "refuse" = "forward";
const proxy = net.createServer(client => {
    let stage = 0;
    client.on("error", () => {});
    client.on("data", function onData(chunk: Buffer) {
        if (stage === 0) {
            if (proxyMode === "refuse") { client.destroy(); return; }
            if (proxyMode === "stall") return;
            stage = 1; client.write(Buffer.from([5, 0])); return;
        }
        client.off("data", onData);
        const length = chunk[4]!;
        const host = chunk.subarray(5, 5 + length).toString();
        const port = chunk.readUInt16BE(5 + length);
        dials.push(`${host}:${port}`);
        const upstream = net.connect(server.port!, "127.0.0.1", () => {
            client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            client.pipe(upstream); upstream.pipe(client);
        });
        upstream.on("error", () => client.destroy());
        client.on("close", () => upstream.destroy());
    });
});
await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", () => resolve()));
const proxyPort = (proxy.address() as net.AddressInfo).port;

// ---- runtime wiring: real transport functions, saved-proxy read and SSH pool replaced by local doubles ------
let leases = 0, releases = 0, tunnelDelayMs = 0;
const ctx: any = { fns: { voice: { transport: {} }, socksProxy: {}, sshProvider: {} } };
Object.assign(ctx.fns.voice.transport, {
    acquire: (o: any) => acquire(ctx, null, o),
    fetch: (o: any) => routedFetch(ctx, null, o),
    openWebSocket: (o: any) => openWebSocket(ctx, null, o),
});
Object.assign(ctx.fns.socksProxy, {
    connect: (o: any) => connect(ctx, null, o),
    request: (o: any) => request(ctx, null, o),
    transportError: (o: any) => transportError(ctx, null, o),
    readSaved: async ({ id }: { id: string }) => {
        if (id !== PROXY_ID) throw Object.assign(new Error("Proxy not found"), { status: 404 });
        return { id, host: "127.0.0.1", port: proxyPort, revision: 1 };
    },
});
ctx.fns.sshProvider.tunnel = async ({ instance }: { instance: string }) => {
    if (tunnelDelayMs) await Bun.sleep(tunnelDelayMs);
    if (instance !== "builder") throw new Error("Unknown SSH instance");
    leases++;
    let done = false;
    return { port: proxyPort, signal: new AbortController().signal, release: () => { if (!done) { done = true; releases++; } } };
};

const routes: Record<string, types.voice.TransportSpec> = {
    direct: { kind: "direct" },
    socks: { kind: "socks", proxyId: PROXY_ID },
    "ssh-tunnel": { kind: "ssh-tunnel", instance: "builder" },
};
const hostFor = (kind: string) => kind === "direct" ? `localhost:${server.port}` : `voice.test:${server.port}`;
const reset = () => { dials.length = 0; destinationHits = 0; leases = 0; releases = 0; proxyMode = "forward"; tunnelDelayMs = 0; sessions.length = 0; };
const snapshot = () => ({ dials: [...dials], destinationHits, leases, releases });
type Socket = types.voice.BoundWebSocket;
const settle = (ws: Socket, ms = 3000) => new Promise<{ opened: boolean; error?: string; code?: number; messages: string[] }>(resolve => {
    const out = { opened: false, error: undefined as string | undefined, code: undefined as number | undefined, messages: [] as string[] };
    const timer = setTimeout(() => resolve(out), ms);
    ws.addEventListener("open", () => { out.opened = true; ws.send(JSON.stringify({ hello: 1 })); });
    ws.addEventListener("message", e => { out.messages.push(String((e as MessageEvent).data)); ws.close(1000); });
    ws.addEventListener("error", e => { out.error = (e as ErrorEvent).message; });
    ws.addEventListener("close", e => { out.code = (e as CloseEvent).code; clearTimeout(timer); resolve(out); });
});
const errorOf = async (work: Promise<unknown>) => { try { await work; return null; } catch (e: any) { return { code: e?.code, message: String(e?.message) }; } };

const results: Record<string, unknown> = {};
for (const kind of Object.keys(routes)) {
    const transport = routes[kind]!;
    // HTTP discovery over the route.
    reset();
    const response = await routedFetch(ctx, null, { transport, url: `https://${hostFor(kind)}/models` });
    const body = await response.json() as { host: string };
    results[`${kind}.http`] = { status: response.status, host: body.host, ...snapshot() };
    // A redirect is refused, never followed, and never retried directly.
    reset();
    results[`${kind}.httpRedirect`] = { error: await errorOf(routedFetch(ctx, null, { transport, url: `https://${hostFor(kind)}/redirect` }).then(r => { if (r.status >= 300 && r.status < 400) throw Object.assign(new Error("redirect status surfaced"), { code: "SURFACED" }); return r; })), ...snapshot() };
    // WSS round trip: upgrade and frames over the route.
    reset();
    const echo = await settle(openWebSocket(ctx, null, { transport, url: `wss://${hostFor(kind)}/echo` }));
    await Bun.sleep(20);
    results[`${kind}.ws`] = { ...echo, ...snapshot() };
    // Redirected upgrade is refused with a fixed status-only error.
    reset();
    const redirected = await settle(openWebSocket(ctx, null, { transport, url: `wss://${hostFor(kind)}/ws-redirect` }));
    results[`${kind}.wsRedirect`] = { ...redirected, ...snapshot() };
}

// TLS identity failure over a route: the proxy forwards to a server whose certificate lacks the requested name.
for (const kind of ["socks", "ssh-tunnel"]) {
    reset();
    const ws = await settle(openWebSocket(ctx, null, { transport: routes[kind]!, url: `wss://wrong.test:${server.port}/echo` }));
    const http = await errorOf(routedFetch(ctx, null, { transport: routes[kind]!, url: `https://wrong.test:${server.port}/models` }));
    results[`${kind}.tls`] = { ws, http, ...snapshot() };
}

// Broken routes fail closed: no destination contact.
reset(); proxyMode = "refuse";
results["socks.refused"] = { ws: await settle(openWebSocket(ctx, null, { transport: routes.socks!, url: `wss://voice.test:${server.port}/echo` })), http: await errorOf(routedFetch(ctx, null, { transport: routes.socks!, url: `https://voice.test:${server.port}/models` })), ...snapshot() };
reset();
results["socks.missing"] = { ws: await settle(openWebSocket(ctx, null, { transport: { kind: "socks", proxyId: "00000000-0000-4000-8000-000000000009" }, url: `wss://voice.test:${server.port}/echo` })), ...snapshot() };
reset();
results["ssh.missing"] = { ws: await settle(openWebSocket(ctx, null, { transport: { kind: "ssh-tunnel", instance: "gone" }, url: `wss://voice.test:${server.port}/echo` })), ...snapshot() };

// Cleanup: abort during setup, setup deadline, a lease that arrives after cancellation, completion.
reset(); proxyMode = "stall";
{ const ac = new AbortController(); const ws = openWebSocket(ctx, null, { transport: routes["ssh-tunnel"]!, url: `wss://voice.test:${server.port}/echo`, signal: ac.signal }); const done = settle(ws); setTimeout(() => ac.abort(), 50); results["ssh.abortSetup"] = { ...(await done), ...snapshot() }; }
reset(); proxyMode = "stall";
results["ssh.timeout"] = { ...(await settle(openWebSocket(ctx, null, { transport: routes["ssh-tunnel"]!, url: `wss://voice.test:${server.port}/echo`, timeoutMs: 100 }))), ...snapshot() };
reset(); tunnelDelayMs = 150;
{ const ac = new AbortController(); const ws = openWebSocket(ctx, null, { transport: routes["ssh-tunnel"]!, url: `wss://voice.test:${server.port}/echo`, signal: ac.signal }); const done = settle(ws); setTimeout(() => ac.abort(), 20); const r = await done; await Bun.sleep(250); results["ssh.lateLease"] = { ...r, ...snapshot() }; }
reset();
{ const ac = new AbortController(); const ws = openWebSocket(ctx, null, { transport: routes["ssh-tunnel"]!, url: `wss://voice.test:${server.port}/echo`, signal: ac.signal }); await new Promise(r => ws.addEventListener("open", r, { once: true })); const closed = new Promise<number>(r => ws.addEventListener("close", e => r((e as CloseEvent).code), { once: true })); ac.abort(); results["ssh.abortOpen"] = { code: await closed, ...snapshot() }; }
reset(); proxyMode = "stall";
{ const ac = new AbortController(); const pending = errorOf(routedFetch(ctx, null, { transport: routes["ssh-tunnel"]!, url: `https://voice.test:${server.port}/models`, signal: ac.signal })); setTimeout(() => ac.abort(), 50); results["ssh.fetchAbort"] = { error: await pending, ...snapshot() }; }

// OpenAI Realtime over each route, with a custom Base URL: no-audio check, then a live session.
const pcm = new Uint8Array(4800);
for (const kind of Object.keys(routes)) {
    reset();
    const transport = routes[kind]!;
    const controller = new AbortController();
    const conn: types.voice.ResolvedConnection = {
        id: "fixture", provider: provider.id, accountName: "route", config: { baseUrl: `https://${hostFor(kind)}/custom/v1` }, transport,
        secret: async () => KEY,
        fetch: (url, init) => routedFetch(ctx, null, { transport, url, init, signal: controller.signal }),
        openWebSocket: (url, options) => openWebSocket(ctx, null, { transport, url, headers: options?.headers, protocols: options?.protocols, signal: controller.signal }),
    };
    const check = await provider.test(ctx, conn);
    await Bun.sleep(50);
    const checkWire = sessions.map(s => ({ path: s.path, auth: s.auth === `Bearer ${KEY}`, types: s.received.map(m => m.type) }));
    const afterCheck = snapshot();
    const events: types.voice.PhraseEvent[] = [];
    const sessionAbort = new AbortController();
    const stream = await provider.open(ctx, conn, { sampleRate: 24000, options: {}, signal: sessionAbort.signal, emit: e => { events.push(e); }, fail: () => {} });
    await stream.append(pcm);
    await stream.commit(1);
    await stream.finish();
    await Bun.sleep(50);
    results[`${kind}.openai`] = {
        check: { status: check.status, reason: check.reason }, checkWire, afterCheck,
        live: { finals: events.filter(e => e.type === "final").map(e => (e as { text: string }).text), types: sessions[1]?.received.map(m => m.type) },
        ...snapshot(),
    };
}
// A broken route fails the OpenAI check without contacting the endpoint.
reset(); proxyMode = "refuse";
{
    const transport = routes.socks!;
    const conn: types.voice.ResolvedConnection = {
        id: "fixture", provider: provider.id, accountName: "route", config: { baseUrl: `https://voice.test:${server.port}/v1` }, transport,
        secret: async () => KEY,
        fetch: (url, init) => routedFetch(ctx, null, { transport, url, init }),
        openWebSocket: (url, options) => openWebSocket(ctx, null, { transport, url, headers: options?.headers }),
    };
    const check = await provider.test(ctx, conn);
    let liveError: { code?: string; message: string } | null = null;
    try { await provider.open(ctx, conn, { sampleRate: 24000, options: {}, signal: new AbortController().signal, emit: () => {}, fail: () => {} }); }
    catch (e: any) { liveError = { code: e?.code, message: String(e?.message) }; }
    results["openai.brokenRoute"] = { check, liveError, ...snapshot() };
}

console.log(JSON.stringify(results));
server.stop(true);
proxy.close();
process.exit(0);
