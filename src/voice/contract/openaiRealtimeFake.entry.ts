/**
 * Controlled fake OpenAI Realtime WebSocket server and its wire driver for integration tests.
 *
 * The adapter under test keeps its real `WebSocket` client: this fake is an independent `Bun.serve` process
 * endpoint on numeric loopback `127.0.0.1` with an ephemeral port. It records every received upgrade and JSON
 * message, answers a transcription `session.update` only when scripted to, and lets a test script native wire
 * events (committed acks, deltas, completed/failed transcripts, errors, disconnects). Nothing here touches an
 * external service or a real credential; audio and transcripts stay in memory for one test and are never logged.
 * Every wait is bounded; `stop()` closes client sockets and the listener even after a failed test.
 */
import type { ServerWebSocket } from "bun";

/** Wire data attached to one accepted fake-server connection. */
type Wire = { conn: FakeConnection; peer: number };

/** One accepted upstream connection, observed from the server side. */
export type FakeConnection = {
    /** Request path with query exactly as the adapter built it. */
    path: string;
    /** Authorization header the adapter sent, or null when absent. */
    authorization: string | null;
    /** OpenAI-Organization header the adapter sent, or null when absent. */
    organization: string | null;
    /** OpenAI-Project header the adapter sent, or null when absent. */
    project: string | null;
    /** Every client JSON message in receive order; append frames keep their base64 audio. */
    received: Record<string, any>[];
    /** Send one native wire event; resolves once the frame is handed to the socket. */
    send: (message: object) => Promise<void>;
    /** Close the upstream socket gracefully with a wire close code (initiates a close handshake). */
    close: (code?: number, reason?: string) => void;
    /** Drop the upstream socket abruptly, as a real network failure: no close handshake. */
    terminate: () => void;
    /** Resolves with the close code the client used (1006 when it terminated abruptly). */
    closed: Promise<number>;
    /** Resolves when the client demonstrably processed a server-initiated close: it either replied with a
     * close frame (handshake complete) or terminated the socket after a server terminate(). A server-side
     * close callback alone does not prove the adapter observed the disconnect — wire delivery is async. */
    clientClosed: Promise<void>;
    /** Wait until the client sent at least `count` messages of `type`. */
    waitReceived: (type: string, count?: number) => Promise<void>;
    /** Whether the upstream socket is still open. */
    isOpen: () => boolean;
    /** Event ids of commits the fake rejected as empty (only with `enforceCommitMinimum`). */
    rejectedCommits: string[];
};

/** Scriptable behavior of the fake for new connections. */
export type FakeBehavior = {
    /** Refuse the WebSocket upgrade with this HTTP status instead of accepting. */
    refuseUpgrade?: number;
    /** Do not answer session.update; the test confirms manually or lets setup time out. */
    manualConfirm?: boolean;
    /** session.updated payload override; the default echoes a minimal transcription session. */
    confirm?: object;
    /** Answer a commit with under 100 ms of appended audio as the live service does: an `invalid_request_error` /
     * `input_audio_buffer_commit_empty` error that echoes the commit's `event_id`; the socket stays open. */
    enforceCommitMinimum?: boolean;
};

/** One running fake server. */
export type FakeRealtimeServer = {
    /** Base URL for the connection's `baseUrl` field: http://127.0.0.1:<ephemeral port>. */
    baseUrl: string;
    /** Script behavior for connections that arrive from now on. */
    behavior: FakeBehavior;
    /** Accepted connections in arrival order. */
    connections: FakeConnection[];
    /** HTTP upgrade attempts (path and status) including refused ones, in arrival order. */
    upgrades: { path: string; status: number }[];
    /** Wait for the indexed accepted connection. */
    next: (index?: number) => Promise<FakeConnection>;
    /** Wait until at least `count` upgrade attempts were observed. */
    waitUpgrade: (count?: number) => Promise<void>;
    /** Close every socket and stop the listener; safe to call more than once. */
    stop: () => void;
};

const WAIT_MS = 4000;
/** 100 ms of PCM16 at 24 kHz: the live service's minimum for one commit. */
const MIN_COMMIT_BYTES = 4800;

/** Wait for a condition with a bounded deadline; never sleeps in a fixed-length loop. */
async function until(what: string, predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + WAIT_MS;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error(`fake realtime server: timed out waiting for ${what}`);
        await Bun.sleep(5);
    }
}

/** Start one fake Realtime server on an ephemeral loopback port. */
export function startFakeRealtime(behavior: FakeBehavior = {}): FakeRealtimeServer {
    const connections: FakeConnection[] = [];
    const upgrades: { path: string; status: number }[] = [];
    const waiters: (() => void)[] = [];
    const wake = () => { for (const resolve of waiters.splice(0)) resolve(); };
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
                wake();
                return new Response("upgrade refused", { status: state.refuseUpgrade });
            }
            const closed = Promise.withResolvers<number>();
            const clientClosed = Promise.withResolvers<void>();
            let serverInitiated = false;
            const conn: FakeConnection = {
                path,
                authorization: req.headers.get("authorization"),
                organization: req.headers.get("openai-organization"),
                project: req.headers.get("openai-project"),
                received: [],
                send: async message => {
                    await until("an open upstream socket", () => socket !== undefined && socket.readyState === 1);
                    socket!.send(JSON.stringify(message));
                },
                close: (code = 1000, reason = "fake close") => { serverInitiated = true; socket?.close(code, reason); },
                terminate: () => { serverInitiated = true; socket?.terminate(); },
                closed: closed.promise,
                clientClosed: clientClosed.promise,
                waitReceived: async (type, count = 1) => {
                    await until(`${count} ${type} message(s)`, () => conn.received.filter(m => m.type === type).length >= count);
                },
                isOpen: () => socket !== undefined && socket.readyState === 1,
                rejectedCommits: [],
            };
            let socket: ServerWebSocket<Wire> | undefined;
            (conn as any).setSocket = (ws: ServerWebSocket<Wire>) => { socket = ws; };
            (conn as any).settleClosed = (code: number) => {
                closed.resolve(code);
                // A server-side close callback does not prove the client saw the disconnect: Bun delivers
                // the client close event on a later task. Resolve clientClosed on the next timer turn,
                // which runs after the already-queued client event.
                if (serverInitiated) setTimeout(() => clientClosed.resolve(), 0);
            };
            if (srv.upgrade(req, { data: { conn, peer: connections.length } })) {
                upgrades.push({ path, status: 101 });
                connections.push(conn);
                wake();
                return;
            }
            upgrades.push({ path, status: 400 });
            wake();
            return new Response("upgrade failed", { status: 400 });
        },
        websocket: {
            open(ws) {
                live.add(ws);
                (ws.data.conn as any).setSocket(ws);
            },
            message(ws, data) {
                const conn = ws.data.conn;
                if (typeof data !== "string") throw new Error("fake realtime server: client sent a binary frame");
                const message = JSON.parse(data) as Record<string, any>;
                conn.received.push(message);
                const wire = ws.data as Wire & { buffered?: number };
                if (message.type === "input_audio_buffer.append") {
                    wire.buffered = (wire.buffered ?? 0) + Buffer.from(String(message.audio), "base64").byteLength;
                } else if (message.type === "input_audio_buffer.commit") {
                    const buffered = wire.buffered ?? 0;
                    wire.buffered = 0;
                    if (state.enforceCommitMinimum && buffered < MIN_COMMIT_BYTES) {
                        conn.rejectedCommits.push(String(message.event_id));
                        ws.send(JSON.stringify(commitEmptyError(message.event_id)));
                    }
                }
                wake();
                if (message.type === "session.update" && !state.manualConfirm) {
                    ws.send(JSON.stringify(state.confirm ?? { type: "session.updated", session: { type: "transcription" } }));
                }
            },
            close(ws, code) {
                live.delete(ws);
                (ws.data.conn as any).settleClosed(code);
                wake();
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
            await until(`connection #${index} to open`, () => conn.isOpen());
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

/** Wait for one accepted connection that received a session.update, and confirm it as a transcription session. */
export async function confirmSetup(server: FakeRealtimeServer, index = 0): Promise<FakeConnection> {
    const conn = await server.next(index);
    await conn.waitReceived("session.update");
    if (server.behavior.manualConfirm) {
        await conn.send(server.behavior.confirm ?? { type: "session.updated", session: { type: "transcription" } });
    }
    return conn;
}

/** Build the native `input_audio_buffer.committed` acknowledgement for one item. */
export function committed(id: string, previous: string | null = null): object {
    return { type: "input_audio_buffer.committed", item_id: id, previous_item_id: previous };
}

/** Build one native transcription wire event (delta / completed / failed) for one item. */
export function transcription(kind: "delta" | "completed" | "failed", id: string, extra: Record<string, unknown> = {}): object {
    return { type: `conversation.item.input_audio_transcription.${kind}`, item_id: id, ...extra };
}

/** Build the live service's recoverable answer to a commit under 100 ms; it echoes the commit's `event_id`. */
export function commitEmptyError(eventId: unknown): object {
    return {
        type: "error",
        error: {
            type: "invalid_request_error", code: "input_audio_buffer_commit_empty",
            message: "Error committing input audio buffer: buffer too small. Expected at least 100ms of audio.",
            param: null, event_id: typeof eventId === "string" ? eventId : null,
        },
    };
}

/** Build an `invalid_request_error` that names no client event, as the service sends for append validation. */
export function uncorrelatedError(code = "invalid_value"): object {
    return { type: "error", error: { type: "invalid_request_error", code, message: "Invalid value.", param: "audio.audio", event_id: null } };
}

/** Send deltas for an item before its commit acknowledgement, as gpt-live-transcribe does while audio streams. */
export async function earlyDeltas(conn: FakeConnection, id: string, deltas: string[]): Promise<void> {
    for (const delta of deltas) await conn.send(transcription("delta", id, { delta }));
}

/** Build the completion the service sends for a silent commit: an empty transcript with metered usage. */
export function emptyCompletion(id: string, seconds = 0.1): object {
    return transcription("completed", id, { transcript: "", usage: { type: "duration", seconds } });
}
