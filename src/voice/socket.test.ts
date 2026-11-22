import { afterEach, expect, jest, test } from "bun:test";
import http from "node:http";
import type { WebSocketHandler } from "bun";
import { makeCtx } from "../$main";
import endpoint from "../$ws_voice_session";
import middleware from "../$middleware";
import currentOrigin from "../http/publicOrigin";
import loadWs from "../procs/http/$loader_ws";
import classify from "../procs/project/classify";
import handle from "../procs/http/handle";
import match from "../procs/http/match";
import selectMiddleware from "../procs/http/middleware";
import socketHandlers from "../procs/http/socketHandlers";
import upgrade from "../procs/http/upgrade";
import emit from "../procs/events/emit";
import subscribe from "../procs/events/subscribe";
import normalize from "./session/open";
import limits from "./session/limits";
import message from "./session/message";
import failure from "./session/failure";
import vadState from "./session/vadState";
import vadPush from "./session/vadPush";
import vadFlush from "./session/vadFlush";
import { createContractRecorder } from "./contract/contractRecorder.entry";

const OWNER = "owner-fixture";
const CHAT = "chat-fixture";
const ORIGIN = "http://localhost:8080";
const PATH = "/voice/session";
const SECRET = "fake-provider-secret-never-public";
const loop = async (predicate: () => boolean) => {
    for (let i = 0; !predicate() && i < 200; i++) await Bun.sleep(5);
    expect(predicate()).toBe(true);
};
const turns = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
// Bun advances timers synchronously; give each periodic access check a turn to settle.
async function tick(ms: number) {
    while (ms > 0) {
        const step = Math.min(ms, 1000);
        jest.advanceTimersByTime(step);
        await turns();
        ms -= step;
    }
}
const gate = () => Promise.withResolvers<void>();
const control = (type: string) => JSON.stringify(type === "start" ? { type, agentId: CHAT, generation: 1 } : { type });
const frame = (sequence: number, sample = 4096, size = 960) => {
    const bytes = Buffer.alloc(size + 4);
    bytes.writeUInt32LE(sequence);
    for (let i = 4; i + 1 < bytes.length; i += 2) bytes.writeInt16LE(sample, i);
    return bytes;
};

type Packet = { type: string; code?: string; message?: string; text?: string; final?: boolean };

function fixture(record: (fields: unknown) => Promise<string | null> = async () => null) {
    const ctx = makeCtx();
    const user = { id: OWNER, role: "owner", disabledAt: null as number | null };
    const row = { created_by: OWNER as string | null, archived_at: null as number | null };
    const identity: Session = { user };
    const streams: ReturnType<typeof createContractRecorder>[] = [];
    const logs: unknown[] = [];
    const counters = { routes: 0, access: 0 };
    const hooks: { beforeAccess?: () => Promise<void>; onOpen?: (index: number) => Promise<void> } = {};
    let openError: unknown;
    const resolved = {
        route: "fixture/test:pcm", provider: "fixture", accountName: "test", modelId: "pcm",
        connectionId: "internal-connection-id", destination: { kind: "host", label: "Local fixture", private: SECRET },
        sampleRate: 24_000, model: { id: "pcm", capabilities: { turnDetection: "client", sampleRates: [24_000] } },
    };
    ctx.state.procs.http.middleware = [{ handler: middleware, prefix: "/", segs: [] }];
    ctx.state.registry = {
        frontendRuntime: { page: () => null },
        auth: { currentUser: (_ctx: Context, _s: Session, { req }: { req: Request }) => ({
            required: true,
            user: req.headers.get("cookie") === "fixture=owner" ? user : req.headers.get("cookie") === "fixture=member" ? { ...user, role: "member" } : null,
        }) },
        h2: { redirect: () => null },
        http: { publicOrigin: currentOrigin },
        procs: {
            http: { handle, upgrade, socketHandlers, match, middleware: selectMiddleware },
            events: { subscribe, emit },
            log: Object.fromEntries(["info", "debug", "warn", "error"].map(level => [level, (_ctx: Context, _s: Session, value: unknown) => logs.push(value)])),
            db: { select: async (_ctx: Context, _s: Session, { sql, params }: { sql: string; params: string[] }) => {
                expect(sql).toContain("u.id = a.created_by");
                expect(sql).toContain("u.role = 'owner'");
                expect(sql).toContain("u.disabled_at IS NULL");
                counters.access++;
                const snapshot = params[0] === CHAT && params[1] === row.created_by && row.created_by === user.id &&
                    user.role === "owner" && user.disabledAt == null ? [{ archived_at: row.archived_at }] : [];
                await hooks.beforeAccess?.();
                return snapshot;
            } },
        },
        voice: {
            journal: { record: (_ctx: Context, _s: Session, fields: unknown) => record(fields) },
            effectiveRoute: async () => { counters.routes++; return { route: resolved.route }; },
            resolveRoute: async () => resolved,
            session: { open: normalize, limits, message, failure, vadState, vadPush, vadFlush },
            connections: { resolve: async () => ({ definition: { open: async (_ctx: Context, _conn: unknown, session: types.voice.StreamSession) => {
                if (openError) throw openError;
                const recorder = createContractRecorder();
                recorder.autoFinal = () => "synthetic transcript";
                const stream = recorder.stream(session);
                const index = streams.push(recorder) - 1;
                await hooks.onOpen?.(index);
                return stream;
            } }, conn: { key: SECRET } }) },
        },
    };

    async function localSocket(start = true) {
        const events: Packet[] = [];
        const state = await endpoint.upgrade(ctx, identity, { req: new Request(ORIGIN + PATH, { headers: { origin: ORIGIN } }), params: {} });
        if (state instanceof Response) throw new Error(`Fixture upgrade refused: ${state.status}`);
        let terminated = false;
        const ws = {
            data: { state },
            send: (text: string) => { events.push(JSON.parse(text)); return text.length; },
            close: () => { terminated = true; socket.disconnect(); },
            getBufferedAmount: () => 0,
        } as unknown as Parameters<typeof endpoint.open>[2]["ws"];
        const socket = {
            events, ended: () => terminated, ws,
            send: (data: Buffer | string) => endpoint.message(ctx, identity, { ws, message: data }),
            disconnect: () => endpoint.close(ctx, identity, { ws }),
        };
        cleanup.add(socket.disconnect);
        endpoint.open(ctx, identity, { ws });
        if (start) socket.send(control("start"));
        await turns();
        return socket;
    }
    return { ctx, user, row, streams, logs, counters, hooks, localSocket, throwOnOpen: (error: unknown) => { openError = error; } };
}

const cleanup = new Set<() => unknown>();
afterEach(() => {
    for (const release of cleanup) release();
    cleanup.clear();
    if (jest.isFakeTimers()) jest.useRealTimers();
});

function last(events: Packet[]) { return events.at(-1); }

// Exercise the real classifier, loader, global middleware, public origin, HTTP upgrade, Bun framing and session core.
test("registered endpoint authenticates and relays PCM and safe final messages on a real loopback socket", async () => {
    const f = fixture();
    const entry = classify(f.ctx, null, { rel: "$ws_voice_session.ts" });
    expect(entry?.routePath).toBe(PATH);
    await loadWs(f.ctx, null, { entries: [{ ...entry, namespace: "app", root: "fixture", fn: endpoint }] });
    const server = Bun.serve<types.procs.http.WsData>({ port: 0, hostname: "127.0.0.1", fetch: (req, srv) => handle(f.ctx, null, { req, server: srv }),
        websocket: socketHandlers(f.ctx, null) as unknown as WebSocketHandler<types.procs.http.WsData> });
    f.ctx.state.procs.http.server = { server, port: server.port! };
    cleanup.add(() => server.stop(true));
    const origin = `http://127.0.0.1:${server.port}`;
    const headers = { upgrade: "websocket", connection: "Upgrade", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", "sec-websocket-version": "13" };
    function status(extra: Record<string, string>) {
        return new Promise<number>((resolve, reject) => {
            const req = http.get(origin + PATH, { headers: { ...headers, ...extra } }, res => { res.resume(); resolve(res.statusCode!); });
            req.on("upgrade", (res, socket) => { socket.destroy(); resolve(res.statusCode!); });
            req.on("error", reject);
        });
    }
    expect(await status({ origin })).toBe(401);
    expect(await status({ origin, cookie: "fixture=member" })).toBe(403);
    expect(await status({ cookie: "fixture=owner" })).toBe(403);
    expect(await status({ origin: origin.replace("http:", "https:"), cookie: "fixture=owner" })).toBe(403);
    expect(await status({ origin: origin + "/", cookie: "fixture=owner" })).toBe(403);
    const events: Packet[] = [];
    const ws = new WebSocket(origin.replace("http:", "ws:") + PATH, { headers: { origin, cookie: "fixture=owner" } });
    cleanup.add(() => ws.close());
    ws.onopen = () => ws.send(control("start"));
    ws.onmessage = event => {
        const value = JSON.parse(String(event.data));
        events.push(value);
        if (value.type === "ready") {
            ws.send(frame(0, 4096));
            ws.send(frame(1, 8192));
            ws.send(control("finish"));
            ws.send(control("finish"));
        }
    };
    await loop(() => ws.readyState === WebSocket.CLOSED);
    expect(events.map(e => e.type)).toEqual(["ready", "phrase", "completed"]);
    expect(Object.keys(events[0]!).sort()).toEqual(["destination", "route", "sampleRate", "sessionId", "type"]);
    expect(events[0]).toMatchObject({ route: "fixture/test:pcm", destination: { kind: "host", label: "Local fixture" }, sampleRate: 24000 });
    expect(events[1]).toMatchObject({ order: 0, revision: 1, text: "synthetic transcript", final: true });
    expect(f.streams[0]!.appended.map(bytes => new DataView(bytes.buffer, bytes.byteOffset).getInt16(0, true))).toEqual([4096, 8192]);
    expect(f.streams[0]!.finishes).toBe(1);
    expect(f.counters.routes).toBe(1);
    expect(f.ctx.state.voice.socketSessions?.size).toBe(0);
    expect(JSON.stringify(events)).not.toContain(SECRET);
    expect(JSON.stringify(events)).not.toContain("internal-connection-id");
    expect(JSON.stringify(f.logs)).not.toMatch(/synthetic transcript|fake-provider-secret|endpoint error/);
});

test("foreign, missing and ownerless chats have identical refusals before any route lookup; an owned archive is readOnly", async () => {
    const f = fixture();
    f.row.created_by = "another-owner";
    const foreign = await f.localSocket();
    f.row.created_by = null;
    const ownerless = await f.localSocket();
    const missing = await f.localSocket(false);
    missing.send(JSON.stringify({ type: "start", agentId: "missing", generation: 1 }));
    await turns();
    expect(foreign.events).toEqual([{ type: "error", code: "unauthorized", message: "Voice access was refused." }]);
    expect(ownerless.events).toEqual(foreign.events);
    expect(missing.events).toEqual(foreign.events);
    f.row.created_by = OWNER;
    f.row.archived_at = 1;
    expect(last((await f.localSocket()).events)?.code).toBe("readOnly");
    expect(f.counters.routes).toBe(0);
    expect(f.streams).toHaveLength(0);
});

test("frame and queue bounds fail closed; a gap and repeat are protocol errors", async () => {
    const f = fixture();
    for (const mode of ["large", "gap", "repeat", "queue"] as const) {
        const s = await f.localSocket();
        const stream = f.streams.at(-1)!;
        if (mode === "large") s.send(frame(0, 4096, 16 * 1024));
        if (mode === "gap") s.send(frame(1));
        if (mode === "repeat") { s.send(frame(0)); s.send(frame(0)); }
        if (mode === "queue") {
            stream.hangAppend = true;
            s.send(frame(0));
            await turns();
            for (let i = 1; i <= 220; i++) s.send(frame(i, 4096, 4800));
        }
        await turns();
        expect(last(s.events)?.code).toBe(mode === "large" || mode === "queue" ? "backpressure" : "protocol");
        expect(stream.cancels).toBe(1);
        expect(stream.finishes).toBe(0);
        expect(f.ctx.state.voice.socketSessions?.size).toBe(0);
    }
});

test("idle timeout is server enforced and cancel releases resources without a transcript", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const s = await f.localSocket();
    await tick(29_999);
    expect(s.ended()).toBe(false);
    await tick(1);
    expect(last(s.events)).toMatchObject({ code: "timeout", message: expect.stringContaining("without audio") });
    expect(f.streams[0]!.cancels).toBe(1);
    const other = await f.localSocket();
    other.send(frame(0));
    other.send(control("cancel"));
    await turns();
    expect(other.events.map(item => item.type)).toEqual(["ready"]);
    expect(f.streams[1]!.cancels).toBe(1);
    expect(f.ctx.state.voice.socketSessions?.size).toBe(0);
});

test("regular silence keeps the relay alive past idle but cannot extend its original deadline", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const s = await f.localSocket();
    let sequence = 0;
    for (let elapsed = 0; elapsed < 300_000; elapsed += 20_000) {
        s.send(frame(sequence++, 0));
        await tick(19_999);
        expect(s.ended()).toBe(false);
        expect(s.events.map(item => item.type)).toEqual(["ready"]);
        await tick(1);
    }
    expect(s.events.map(item => item.type)).toEqual(["ready", "error"]);
    expect(last(s.events)).toMatchObject({ code: "timeout", message: expect.stringContaining("five-minute") });
    expect(f.streams).toHaveLength(1);
    expect(f.streams[0]!.commits).toEqual([]);
    expect(f.ctx.state.voice.socketSessions?.size).toBe(0);
});

test("five-minute limit stops accepting PCM and emits pending finals followed by timeout without a finish request", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const s = await f.localSocket();
    const stream = f.streams[0]!;
    stream.autoFinal = null; // Hold the final while a client continues to send after the deadline.
    for (let i = 0; i < 12; i++) {
        s.send(frame(i));
        await tick(25_000);
    }
    expect(stream.commits).toEqual([0]);
    expect(s.ended()).toBe(false);
    s.send(frame(12));
    stream.emit({ type: "final", order: 0, text: "synthetic transcript" });
    await turns();
    expect(s.events.map(item => item.type)).toEqual(["ready", "phrase", "error"]);
    expect(s.events[1]).toMatchObject({ final: true, text: "synthetic transcript" });
    expect(last(s.events)).toMatchObject({ code: "timeout", message: expect.stringContaining("five-minute") });
    expect(f.streams[0]!.finishes).toBe(1);
    expect(f.streams[0]!.appended.reduce((total, pcm) => total + pcm.byteLength, 0)).toBe(12 * 960);
    expect(f.ctx.state.voice.socketSessions?.size).toBe(0);
});

test("a hanging provider cannot keep finalization or the lease alive", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const s = await f.localSocket();
    f.streams[0]!.hang = true;
    s.send(frame(0));
    s.send(control("finish"));
    await turns();
    await tick(10_000);
    expect(last(s.events)).toMatchObject({ code: "timeout", message: "Voice finalization timed out." });
    expect(f.streams[0]!.cancels).toBe(1);
    expect(f.ctx.state.voice.socketSessions?.size).toBe(0);
});

test("silent clients lose edit access on archive notification, owner transfer and account revocation", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const archived = await f.localSocket();
    const stream = f.streams[0]!;
    stream.autoFinal = null;
    archived.send(frame(0));
    for (let i = 1; i <= 5; i++) archived.send(frame(i, 0, 4800));
    await turns();
    expect(stream.commits).toEqual([0]);
    f.row.archived_at = 10;
    f.ctx.fns.procs.events.emit({ topic: "agents", event: { type: "agents.changed", agentId: CHAT, reason: "archive" } });
    stream.emit({ type: "final", order: 0, text: "must not be delivered" });
    await turns();
    expect(archived.events.map(item => item.type)).toEqual(["ready", "error"]);
    expect(last(archived.events)?.code).toBe("readOnly");
    expect(stream.cancels).toBe(1);

    f.row.archived_at = null;
    const transferred = await f.localSocket();
    f.row.created_by = "another-owner";
    await tick(1_000);
    expect(last(transferred.events)?.code).toBe("readOnly");
    expect(f.streams[1]!.cancels).toBe(1);

    f.row.created_by = OWNER;
    const revoked = await f.localSocket();
    f.user.disabledAt = 100;
    await tick(1_000);
    expect(last(revoked.events)?.code).toBe("readOnly");
    expect(f.streams[2]!.cancels).toBe(1);
    expect(f.ctx.state.voice.socketSessions?.size).toBe(0);
    expect(f.ctx.state.procs.events.subs?.size).toBe(0);
});

test("second tab supersedes the first; old timers and disconnect cannot release the new lease", async () => {
    jest.useFakeTimers();
    const f = fixture();
    const first = await f.localSocket();
    await tick(1_000);
    const second = await f.localSocket();
    expect(last(first.events)?.code).toBe("superseded");
    expect(f.streams[0]!.cancels).toBe(1);
    first.disconnect();
    await tick(29_000);
    expect(second.ended()).toBe(false);
    expect(f.ctx.state.voice.socketSessions?.size).toBe(1);
    second.disconnect();
    await turns();
    expect(f.ctx.state.voice.socketSessions?.size).toBe(0);
    expect(f.streams[1]!.cancels).toBe(1);
});

test("a slow start authorization cannot take over a newer active session", async () => {
    const f = fixture();
    const pending = gate();
    f.hooks.beforeAccess = () => f.counters.access === 1 ? pending.promise : Promise.resolve();
    const first = await f.localSocket();
    const second = await f.localSocket();
    pending.resolve();
    await turns();
    expect(last(first.events)?.code).toBe("superseded");
    expect(last(second.events)?.type).toBe("ready");
    expect(f.ctx.state.voice.socketSessions?.size).toBe(1);
    expect(f.streams).toHaveLength(1);
});

test("disconnect during async provider open aborts immediately and releases its late handle without touching the new socket", async () => {
    const f = fixture();
    const pending = gate();
    f.hooks.onOpen = index => index === 0 ? pending.promise : Promise.resolve();
    const first = await f.localSocket();
    expect(first.events).toEqual([]);
    expect(f.streams[0]!.session()?.signal.aborted).toBe(false);
    first.disconnect();
    expect(f.streams[0]!.session()?.signal.aborted).toBe(true);
    expect(f.ctx.state.voice.socketSessions?.size).toBe(0);
    const second = await f.localSocket();
    pending.resolve();
    await turns();
    expect(f.streams[0]!.cancels).toBe(1);
    expect(first.events).toEqual([]);
    expect(last(second.events)?.type).toBe("ready");
    expect(f.ctx.state.voice.socketSessions?.size).toBe(1);
});

test("provider opening and streaming errors do not expose vendor payloads", async () => {
    const rows: unknown[] = [];
    const id = "abcdef0123456789";
    const written = Promise.withResolvers<string>();
    const f = fixture(async fields => { rows.push(fields); return rows.length === 1 ? id : written.promise; });
    f.throwOnOpen(Object.assign(new Error(SECRET), { code: "providerAuth", errorId: SECRET }));
    const failed = await f.localSocket();
    expect(last(failed.events)).toMatchObject({ type: "error", code: "providerAuth", errorId: id });
    f.throwOnOpen(undefined);
    const listening = await f.localSocket();
    const transcript = "private transcript fixture";
    const hostile = { code: "provider" as const, message: `${SECRET} ${transcript}`, diagnosticCause: transcript };
    f.streams[0]!.session()!.fail(hostile as Parameters<types.voice.StreamSession["fail"]>[0]);
    f.streams[0]!.fail("provider", SECRET);
    await turns();
    expect(listening.ended()).toBe(false);
    expect(rows).toEqual([
        { provider: "fixture", model: "pcm", stage: "opening", cause: "authentication" },
        { provider: "fixture", model: "pcm", stage: "streaming", cause: "unknown" },
    ]);
    written.reject(new Error(SECRET));
    await turns();
    expect(last(listening.events)).toEqual({ type: "error", code: "provider", message: "The voice provider failed." });
    const output = JSON.stringify([rows, failed.events, listening.events, f.logs]);
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain(transcript);
    expect(f.ctx.state.voice.socketSessions?.size).toBe(0);
});

test("provider reason and detail reach the journal as plain strings only", async () => {
    const rows: unknown[] = [];
    const f = fixture(async fields => { rows.push(fields); return "abcdef0123456789"; });
    const listening = await f.localSocket();
    const failure = { code: "provider" as const, message: SECRET, diagnosticReason: "socketClosed", diagnosticDetail: "1006" };
    f.streams[0]!.session()!.fail(failure);
    await turns();
    expect(last(listening.events)).toMatchObject({ type: "error", code: "provider", errorId: "abcdef0123456789" });
    const second = await f.localSocket();
    const hostile = { code: "provider" as const, message: SECRET, diagnosticReason: { SECRET }, diagnosticDetail: 1006 };
    f.streams[1]!.session()!.fail(hostile as unknown as Parameters<types.voice.StreamSession["fail"]>[0]);
    await turns();
    expect(last(second.events)?.type).toBe("error");
    expect(rows).toEqual([
        { provider: "fixture", model: "pcm", stage: "streaming", cause: "unknown", reason: "socketClosed", detail: "1006" },
        { provider: "fixture", model: "pcm", stage: "streaming", cause: "unknown" },
    ]);
    expect(JSON.stringify(rows)).not.toContain(SECRET);
});

test("core remains compatible with callers that do not pass a transport signal", async () => {
    const f = fixture();
    const events: types.voice.SessionEvent[] = [];
    const session = await f.ctx.fns.voice.session.open({ route: "fixture/test:pcm", onEvent: e => events.push(e) });
    await session.append(frame(0).subarray(4));
    expect(await session.finish()).toEqual({ ok: true });
    expect(events.map(e => e.type)).toEqual(["phrase", "completed"]);
    expect(f.streams[0]!.finishes).toBe(1);
});

test("a provider result also rechecks a silent ownership transfer before delivery", async () => {
    const f = fixture();
    const client = await f.localSocket();
    const stream = f.streams[0]!;
    stream.autoFinal = null;
    client.send(frame(0));
    for (let i = 1; i <= 5; i++) client.send(frame(i, 0, 4800));
    await turns();
    expect(stream.commits).toEqual([0]);
    f.row.created_by = "another-owner";
    stream.emit({ type: "final", order: 0, text: "must not be delivered" });
    await turns();
    expect(client.events.map(item => item.type)).toEqual(["ready", "error"]);
    expect(last(client.events)?.code).toBe("readOnly");
});
