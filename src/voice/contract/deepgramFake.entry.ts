/**
 * Controlled fake Deepgram `/v1/listen` WebSocket server for integration tests.
 *
 * The adapter under test keeps its real WebSocket client: this fake is an independent `Bun.serve` endpoint on
 * numeric loopback with an ephemeral port. It records the upgrade (path with query, Authorization header), every
 * binary audio frame and every JSON control message, and lets a test script native wire events (`Results`,
 * `Metadata`, `Error`, closes). `CloseStream` is answered like the service: `Metadata` with the received audio
 * duration (unless scripted otherwise), then a normal close. Nothing here touches an external service or a real
 * credential; audio and transcripts stay in memory for one test. Every wait is bounded.
 */
import type { ServerWebSocket } from "bun";

/** One frame the client sent: binary audio (its byte length) or a parsed JSON control message. */
export type FakeFrame = { kind: "binary"; bytes: number } | { kind: "text"; message: Record<string, any> };

/** One accepted upstream connection, observed from the server side. */
export type FakeConnection = {
    /** Request path with query exactly as the adapter built it. */
    path: string;
    /** Parsed query of the upgrade request. */
    query: URLSearchParams;
    /** Authorization header the adapter sent, or null when absent. */
    authorization: string | null;
    /** Every client frame in receive order. */
    frames: FakeFrame[];
    /** Total binary audio bytes received. */
    audioBytes: () => number;
    /** Binary audio bytes received before the indexed Finalize (exclusive end of that commit). */
    bytesBeforeFinalize: (index: number) => number;
    /** Send one native JSON wire event. */
    send: (message: object) => Promise<void>;
    /** Send one raw text frame, for malformed-frame tests. */
    sendRaw: (frame: string) => Promise<void>;
    /** Close the upstream socket with a wire close code. */
    close: (code?: number, reason?: string) => void;
    /** Drop the upstream socket abruptly, without a close handshake. */
    terminate: () => void;
    /** Resolves with the close code once the socket closed. */
    closed: Promise<number>;
    /** Resolves when the client observed a server-initiated close (on the next timer turn). */
    clientClosed: Promise<void>;
    /** Wait until the client sent at least `count` control messages of `type`. */
    waitReceived: (type: string, count?: number) => Promise<void>;
    /** Wait until at least `bytes` audio bytes arrived. */
    waitAudio: (bytes: number) => Promise<void>;
    /** Control message types in receive order. */
    controls: () => string[];
    /** Whether the upstream socket is still open. */
    isOpen: () => boolean;
};

/** Scriptable behavior of the fake for new connections. */
export type FakeBehavior = {
    /** Refuse the WebSocket upgrade with this HTTP status instead of accepting. */
    refuseUpgrade?: number;
    /** Do not answer CloseStream: the client must bound its wait. */
    ignoreCloseStream?: boolean;
    /** `Metadata.duration` sent before closing on CloseStream; defaults to the received audio seconds. */
    metadataDuration?: number;
};

/** One running fake server. */
export type FakeDeepgramServer = {
    /** Base URL for the connection's `baseUrl` field: http://127.0.0.1:<ephemeral port>. */
    baseUrl: string;
    behavior: FakeBehavior;
    connections: FakeConnection[];
    /** HTTP upgrade attempts (path and status) including refused ones. */
    upgrades: { path: string; status: number }[];
    next: (index?: number) => Promise<FakeConnection>;
    waitUpgrade: (count?: number) => Promise<void>;
    stop: () => void;
};

type Wire = { conn: FakeConnection };
const WAIT_MS = 4000;
/** PCM16 at 16 kHz. */
export const BYTES_PER_SECOND = 32_000;

async function until(what: string, predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + WAIT_MS;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error(`fake deepgram server: timed out waiting for ${what}`);
        await Bun.sleep(5);
    }
}

/** Start one fake Deepgram server on an ephemeral loopback port. */
export function startFakeDeepgram(behavior: FakeBehavior = {}): FakeDeepgramServer {
    const connections: FakeConnection[] = [];
    const upgrades: { path: string; status: number }[] = [];
    const live = new Set<ServerWebSocket<Wire>>();
    const state: FakeBehavior = { ...behavior };

    const server = Bun.serve<Wire>({
        port: 0,
        hostname: "127.0.0.1",
        fetch(req, srv) {
            const url = new URL(req.url);
            const path = url.pathname + url.search;
            if (state.refuseUpgrade !== undefined) {
                upgrades.push({ path, status: state.refuseUpgrade });
                return new Response("upgrade refused", { status: state.refuseUpgrade });
            }
            const closed = Promise.withResolvers<number>();
            const clientClosed = Promise.withResolvers<void>();
            let serverInitiated = false;
            let socket: ServerWebSocket<Wire> | undefined;
            const frames: FakeFrame[] = [];
            const controls = () => frames.flatMap(f => f.kind === "text" ? [String(f.message.type)] : []);
            const conn: FakeConnection = {
                path, query: url.searchParams, authorization: req.headers.get("authorization"), frames,
                audioBytes: () => frames.reduce((sum, f) => sum + (f.kind === "binary" ? f.bytes : 0), 0),
                bytesBeforeFinalize: index => {
                    let bytes = 0, seen = 0;
                    for (const frame of frames) {
                        if (frame.kind === "binary") bytes += frame.bytes;
                        else if (frame.message.type === "Finalize" && seen++ === index) return bytes;
                    }
                    throw new Error(`fake deepgram server: no Finalize #${index}`);
                },
                send: async message => {
                    await until("an open upstream socket", () => socket !== undefined && socket.readyState === 1);
                    socket!.send(JSON.stringify(message));
                },
                sendRaw: async frame => {
                    await until("an open upstream socket", () => socket !== undefined && socket.readyState === 1);
                    socket!.send(frame);
                },
                close: (code = 1000, reason = "fake close") => { serverInitiated = true; socket?.close(code, reason); },
                terminate: () => { serverInitiated = true; socket?.terminate(); },
                closed: closed.promise,
                clientClosed: clientClosed.promise,
                waitReceived: async (type, count = 1) => {
                    await until(`${count} ${type} message(s)`, () => controls().filter(t => t === type).length >= count);
                },
                waitAudio: async bytes => { await until(`${bytes} audio bytes`, () => conn.audioBytes() >= bytes); },
                controls,
                isOpen: () => socket !== undefined && socket.readyState === 1,
            };
            (conn as any).setSocket = (ws: ServerWebSocket<Wire>) => { socket = ws; };
            (conn as any).settleClosed = (code: number) => {
                closed.resolve(code);
                if (serverInitiated) setTimeout(() => clientClosed.resolve(), 0);
            };
            (conn as any).markServerClose = () => { serverInitiated = true; };
            if (srv.upgrade(req, { data: { conn } })) {
                upgrades.push({ path, status: 101 });
                connections.push(conn);
                return;
            }
            upgrades.push({ path, status: 400 });
            return new Response("upgrade failed", { status: 400 });
        },
        websocket: {
            open(ws) {
                live.add(ws);
                (ws.data.conn as any).setSocket(ws);
            },
            message(ws, data) {
                const conn = ws.data.conn;
                if (typeof data !== "string") {
                    // The live service treats an empty binary frame as a close request; record it to catch it.
                    conn.frames.push({ kind: "binary", bytes: data.byteLength });
                    return;
                }
                const message = JSON.parse(data) as Record<string, any>;
                conn.frames.push({ kind: "text", message });
                if (message.type === "CloseStream" && !state.ignoreCloseStream) {
                    const duration = state.metadataDuration ?? conn.audioBytes() / BYTES_PER_SECOND;
                    ws.send(JSON.stringify({ type: "Metadata", request_id: "fake-request", duration, channels: 1 }));
                    (conn as any).markServerClose();
                    ws.close(1000, "fake done");
                }
            },
            close(ws, code) {
                live.delete(ws);
                (ws.data.conn as any).settleClosed(code);
            },
        },
    });

    let stopped = false;
    return {
        baseUrl: `http://127.0.0.1:${server.port}`,
        behavior: state,
        connections,
        upgrades,
        next: async (index = 0) => {
            await until(`connection #${index}`, () => connections.length > index);
            const conn = connections[index]!;
            await until(`connection #${index} to open`, () => conn.isOpen() || conn.frames.length > 0);
            return conn;
        },
        waitUpgrade: async (count = 1) => { await until(`${count} upgrade attempt(s)`, () => upgrades.length >= count); },
        stop: () => {
            if (stopped) return;
            stopped = true;
            for (const ws of live) { try { ws.terminate(); } catch { /* already gone */ } }
            live.clear();
            server.stop(true);
        },
    };
}

/** Build one native `Results` message for audio `[start, start + duration)` in stream seconds. */
export function results(text: string, start: number, duration: number, flags: { isFinal?: boolean; fromFinalize?: boolean; speechFinal?: boolean } = {}): object {
    return {
        type: "Results", channel_index: [0, 1], start, duration,
        is_final: flags.isFinal ?? false, speech_final: flags.speechFinal ?? false, from_finalize: flags.fromFinalize ?? false,
        channel: { alternatives: [{ transcript: text, confidence: 0.9, words: [] }] },
    };
}
