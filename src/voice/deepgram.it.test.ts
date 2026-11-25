// The real deepgram adapter's real WebSocket client against a controlled fake Deepgram server on numeric
// loopback. No external traffic, no real credentials: mkTestCtx supplies the migrated isolated test Postgres.
// The shared provider contract runs through a driver that speaks native `/v1/listen` events only.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { mkTestCtx } from "../_testCtx.entry";
import provider from "./$voiceProvider_deepgram";
import { runVoiceProviderContract } from "./contract/providerContract.entry";
import type { ContractFixture } from "./contract/providerContract.entry";
import { pcmChunk } from "./contract/contractRecorder.entry";
import { BYTES_PER_SECOND, results, startFakeDeepgram } from "./contract/deepgramFake.entry";
import type { FakeDeepgramServer } from "./contract/deepgramFake.entry";
import { deepgramUpstream } from "./contract/deepgramDriver.entry";

// Fixed fake credential — never a real key, and never expected in any event, message or log.
const KEY = "fake-it-deepgram-key-0123456789abcdef";
const speech = () => pcmChunk({ sampleRate: 16_000, windows: 5, amplitude: 0.5 });
const pause = () => pcmChunk({ sampleRate: 16_000, windows: 30, amplitude: 0 });
let accountSeq = 0;
const routeOf = (view: types.voice.ConnectionView) => `deepgram/${view.accountName}:nova-3`;

const servers = new Set<FakeDeepgramServer>();
const sessions = new Set<types.voice.VoiceSession>();
const streams = new Set<types.voice.VoiceStream>();
afterEach(async () => {
    for (const session of sessions) { try { await session.cancel(); } catch { /* teardown must not throw */ } }
    sessions.clear();
    for (const stream of streams) { try { await stream.cancel(); } catch { /* teardown must not throw */ } }
    streams.clear();
    for (const server of servers) server.stop();
    servers.clear();
});
afterAll(() => { for (const server of servers) server.stop(); });
beforeAll(async () => { await mkTestCtx(); }, 60_000);

function fake(behavior: Parameters<typeof startFakeDeepgram>[0] = {}): FakeDeepgramServer {
    const server = startFakeDeepgram(behavior);
    servers.add(server);
    return server;
}

/** Fresh isolated ctx with the real built-in declaration registered and one stored connection to the fake. */
async function makeFixture(server: FakeDeepgramServer, config: Record<string, unknown> = {}) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 22).toString("base64") } });
    ctx.state.voice ??= {};
    ctx.state.voice.providers = {
        deepgram: {
            owner: "core", module: "voice", rel: "voice/$voiceProvider_deepgram.ts",
            abs: resolve(import.meta.dir, "$voiceProvider_deepgram.ts"), definition: provider,
        },
    };
    const view = await ctx.fns.voice.create({
        provider: "deepgram", accountName: `dg-${accountSeq++}`,
        config: { baseUrl: server.baseUrl, ...config }, secrets: { apiKey: KEY },
    });
    return { ctx, view };
}

async function openSession(ctx: any, route: string) {
    const events: types.voice.SessionEvent[] = [];
    const session: types.voice.VoiceSession = await ctx.fns.voice.session.open({
        route, onEvent: (event: types.voice.SessionEvent) => events.push(event),
    });
    sessions.add(session);
    return { session, events };
}

/** Provider-level stream over a real WebSocket to the fake, for exact wire framing checks. */
async function openStream(server: FakeDeepgramServer, config: Record<string, types.voice.ConfigValue> = {}) {
    const events: types.voice.PhraseEvent[] = [];
    const failures: { code: string; message: string }[] = [];
    const controller = new AbortController();
    const conn: types.voice.ResolvedConnection = {
        id: "fixture", provider: provider.id, accountName: "it", config: { baseUrl: server.baseUrl, ...config },
        secret: async () => KEY, transport: { kind: "direct" },
        fetch: async () => { throw new Error("no HTTP in this adapter"); },
        openWebSocket: (url, options) => new WebSocket(url, { headers: options?.headers ?? {} } as unknown as string[]) as unknown as types.voice.BoundWebSocket,
    };
    const stream = await provider.open({} as Context, conn, {
        sampleRate: 16_000, options: {}, signal: controller.signal,
        emit: event => { events.push(event); }, fail: ({ code, message }) => { failures.push({ code, message }); },
    });
    streams.add(stream);
    return { stream, events, failures, conn: await server.next() };
}

async function until(predicate: () => boolean, ms = 4000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error("timed out waiting for a session effect");
        await Bun.sleep(5);
    }
}

function finals(events: types.voice.SessionEvent[]) {
    return events.filter((e): e is Extract<types.voice.SessionEvent, { type: "phrase" }> => e.type === "phrase" && e.final)
        .map(({ order, text }) => ({ order, text }));
}

function safe(value: unknown) {
    const json = JSON.stringify(value, value instanceof Error ? Object.getOwnPropertyNames(value) : undefined);
    expect(json).not.toContain(KEY);
    expect(json).not.toContain("Token ");
    expect(json).not.toContain("fake upstream");
}

runVoiceProviderContract({
    name: "deepgram (fake listen socket)",
    phraseFailures: false,
    setup: async (): Promise<ContractFixture> => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        return { ctx, route: routeOf(view), upstream: deepgramUpstream(server) };
    },
});

describe("deepgram against the fake listen server", () => {
    test("Default connection: token header, fixed query, ready after upgrade", async () => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        const { session } = await openSession(ctx, routeOf(view));
        const conn = await server.next();
        expect(conn.authorization).toBe(`Token ${KEY}`);
        expect(conn.path).toBe("/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&endpointing=false&smart_format=true&no_delay=true&language=multi");
        expect(conn.path).not.toContain(KEY);
        expect(session.route.destination.label).toBe("Configured endpoint (" + new URL(server.baseUrl).host + ")");
    });

    test("Browser chunks of another size are re-framed into 50 ms frames", async () => {
        const server = fake();
        const { stream, conn } = await openStream(server);
        for (let i = 0; i < 3; i++) await stream.append(new Uint8Array(1000).fill(3));
        await stream.commit(0);
        await conn.waitReceived("Finalize");
        expect(conn.frames).toEqual([{ kind: "binary", bytes: 1600 }, { kind: "binary", bytes: 1400 }, { kind: "text", message: { type: "Finalize" } }]);
    });

    test("Two phrases with silence: two Finalize messages and two ordered phrases with revisions", async () => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        const { session, events } = await openSession(ctx, routeOf(view));
        const conn = await server.next();
        await session.append(speech());
        const firstPause = session.append(pause());
        await conn.waitReceived("Finalize", 1);
        await firstPause;
        const firstEnd = conn.bytesBeforeFinalize(0) / BYTES_PER_SECOND;
        await conn.send(results("one", 0, firstEnd / 2));
        await conn.send(results("one phrase", 0, firstEnd / 2));
        await conn.send(results("One phrase.", 0, firstEnd, { isFinal: true, fromFinalize: true }));
        await session.append(speech());
        const finishing = session.finish();
        await conn.waitReceived("Finalize", 2);
        const secondEnd = conn.bytesBeforeFinalize(1) / BYTES_PER_SECOND;
        await conn.send(results("Two phrases.", firstEnd + 0.05, secondEnd - firstEnd - 0.05, { isFinal: true, fromFinalize: true }));
        expect(await finishing).toEqual({ ok: true });
        const phrases = events.filter((e): e is Extract<types.voice.SessionEvent, { type: "phrase" }> => e.type === "phrase");
        expect(phrases.map(({ order, text, final }) => ({ order, text, final }))).toEqual([
            { order: 0, text: "one", final: false },
            { order: 0, text: "one phrase", final: false },
            { order: 0, text: "One phrase.", final: true },
            { order: 1, text: "Two phrases.", final: true },
        ]);
        expect(conn.controls()).toEqual(["Finalize", "Finalize", "CloseStream"]);
        expect(events.at(-1)).toEqual({ type: "completed" });
        await conn.closed;
    });

    test("Several final segments in one phrase are joined with one space", async () => {
        const server = fake();
        const { stream, events, conn } = await openStream(server);
        await stream.append(new Uint8Array(32_000).fill(1)); // 1 s
        await stream.commit(0);
        await conn.waitReceived("Finalize");
        await conn.send(results("first part", 0, 0.5, { isFinal: true }));
        await conn.send(results("second part", 0.5, 0.3, { isFinal: true, fromFinalize: true }));
        await until(() => events.some(e => e.type === "final"));
        expect(events.filter(e => e.type === "final")).toEqual([{ type: "final", order: 0, text: "first part second part" }]);
    });

    test("Straddling results: a segment before the commit belongs to it; a later one to the next phrase", async () => {
        const server = fake();
        const { stream, events, conn } = await openStream(server);
        await stream.append(new Uint8Array(32_000).fill(1)); // 0–1 s
        // Deepgram finalized a segment of the first phrase before our commit arrived.
        await conn.waitAudio(32_000);
        await conn.send(results("early", 0, 0.6, { isFinal: true }));
        await Bun.sleep(30); // Let the client read it before the commit.
        await stream.commit(0);
        await stream.append(new Uint8Array(32_000).fill(1)); // 1–2 s
        await stream.commit(1);
        await conn.waitReceived("Finalize", 2);
        // A result covering the first commit's audio settles it by coverage, without from_finalize.
        await conn.send(results("late", 0.6, 0.4, { isFinal: true }));
        // Text for the second phrase's audio, with a start within tolerance after the first end.
        await conn.send(results("next", 1.02, 0.98, { isFinal: true, fromFinalize: true }));
        await until(() => events.filter(e => e.type === "final").length === 2);
        expect(events.filter(e => e.type === "final")).toEqual([
            { type: "final", order: 0, text: "early late" },
            { type: "final", order: 1, text: "next" },
        ]);
    });

    test("Finalize without an answer settles an empty final after the quiet period", async () => {
        const server = fake();
        const { stream, events, conn } = await openStream(server);
        await stream.append(new Uint8Array(3200));
        await stream.commit(0);
        await stream.append(new Uint8Array(3200).fill(1));
        await stream.commit(1);
        await conn.waitReceived("Finalize", 2);
        // The second commit is answered at once, but settlement waits for the silent first one.
        await conn.send(results("later", 0.1, 0.1, { isFinal: true, fromFinalize: true }));
        await Bun.sleep(200);
        expect(events.filter(e => e.type === "final")).toEqual([]);
        await until(() => events.filter(e => e.type === "final").length === 2, 3000);
        expect(events.filter(e => e.type === "final")).toEqual([
            { type: "final", order: 0, text: "" },
            { type: "final", order: 1, text: "later" },
        ]);
    });

    test("An empty commit settles without Finalize", async () => {
        const server = fake();
        const { stream, events, conn } = await openStream(server);
        await stream.commit(0);
        expect(events).toEqual([{ type: "final", order: 0, text: "" }]);
        await stream.finish();
        await conn.closed;
        expect(conn.controls()).toEqual(["CloseStream"]);
    });

    test("Paused capture sends KeepAlive and the session stays open", async () => {
        const server = fake();
        const { stream, failures, conn } = await openStream(server);
        await stream.append(new Uint8Array(1600));
        await until(() => conn.controls().includes("KeepAlive"), 6000);
        expect(conn.isOpen()).toBe(true);
        expect(failures).toEqual([]);
        expect(conn.frames.some(f => f.kind === "binary" && f.bytes === 0)).toBe(false);
    }, 10_000);

    test("Finish reports usage from the closing Metadata", async () => {
        const server = fake({ metadataDuration: 12.5 });
        const { ctx, view } = await makeFixture(server);
        const { session, events } = await openSession(ctx, routeOf(view));
        const conn = await server.next();
        expect(await session.finish()).toEqual({ ok: true });
        expect(session.status().usage.audioSeconds).toBe(12.5);
        expect(events).toEqual([{ type: "completed" }]);
        expect(conn.controls()).toEqual(["CloseStream"]);
    });

    test("Finish waits a bounded time when the service ignores CloseStream", async () => {
        const server = fake({ ignoreCloseStream: true });
        const { stream, conn } = await openStream(server);
        const started = Date.now();
        await stream.finish();
        expect(Date.now() - started).toBeLessThan(7000);
        await conn.closed;
    }, 10_000);

    test("Cancel leaves no open socket", async () => {
        const server = fake();
        const { stream, conn } = await openStream(server);
        await stream.append(new Uint8Array(1600));
        await stream.cancel();
        await conn.closed;
        expect(conn.isOpen()).toBe(false);
    });

    test("Rejected key at start: providerAuth, socketError http_401, no audio, no key", async () => {
        for (const status of [401, 403, 429, 500]) {
            const server = fake({ refuseUpgrade: status });
            const { ctx, view } = await makeFixture(server);
            let caught: any;
            try { await openSession(ctx, routeOf(view)); } catch (error) { caught = error; }
            await server.waitUpgrade();
            expect(caught).toMatchObject({ code: status === 401 || status === 403 ? "providerAuth" : "provider" });
            safe(caught);
            expect(server.connections).toHaveLength(0);
            const rows = await ctx.fns.procs.db.select({ sql: "SELECT cause, reason, detail FROM voice_error_journal ORDER BY created_at DESC LIMIT 1", params: [] });
            expect(rows).toMatchObject([{
                cause: status === 429 ? "rateLimit" : status === 500 ? "unknown" : "authentication",
                reason: "socketError", detail: `http_${status}`,
            }]);
        }
    });

    test("Stream closed for bad audio: provider error, socketClosed 1008, no reason text", async () => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        const { session, events } = await openSession(ctx, routeOf(view));
        const conn = await server.next();
        conn.close(1008, "fake upstream bad audio");
        await until(() => events.some(e => e.type === "error"));
        expect(await session.finish()).toEqual({ ok: false, code: "provider" });
        const event = events[0];
        if (event?.type !== "error" || !event.errorId) throw new Error("Missing terminal reference");
        expect(event).toMatchObject({ code: "provider", message: "The voice provider failed." });
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT * FROM voice_error_journal WHERE id = ?", params: [event.errorId] });
        expect(rows).toMatchObject([{ provider: "deepgram", model: "nova-3", reason: "socketClosed", detail: "1008" }]);
        safe([rows, events]);
    });

    test("Service Error and malformed frames fail with fixed reasons and no frame text", async () => {
        for (const [frame, reason] of [
            [JSON.stringify({ type: "Error", description: `fake upstream ${KEY}`, message: "fake upstream" }), "serviceError"],
            ["not json fake upstream", "malformedMessage"],
            [JSON.stringify({ kind: "Results" }), "malformedMessage"],
        ] as const) {
            const server = fake();
            const { ctx, view } = await makeFixture(server);
            const { events } = await openSession(ctx, routeOf(view));
            const conn = await server.next();
            await conn.sendRaw(frame);
            await until(() => events.some(e => e.type === "error"));
            const event = events.find(e => e.type === "error");
            if (event?.type !== "error" || !event.errorId) throw new Error("Missing terminal reference");
            const rows = await ctx.fns.procs.db.select({ sql: "SELECT reason, detail FROM voice_error_journal WHERE id = ?", params: [event.errorId] });
            expect(rows).toEqual([{ reason, detail: null }]);
            safe([rows, events]);
        }
    });

    test("Test a valid connection sends no audio; a rejected key reports bad-key", async () => {
        const server = fake();
        const { ctx, view } = await makeFixture(server, { languages: "ru", keyterms: "MauzCode" });
        const result = await ctx.fns.voice.connections.test({ id: view.id, timeoutMs: 5000 });
        expect(result).toMatchObject({ status: "available", reason: "voice-ok" });
        const conn = await server.next();
        await conn.closed;
        expect(conn.frames.filter(f => f.kind === "binary")).toEqual([]);
        expect(conn.controls()).toEqual(["CloseStream"]);
        expect(conn.query.get("language")).toBe("ru");

        const bad = fake({ refuseUpgrade: 401 });
        const badFixture = await makeFixture(bad);
        const checked = await badFixture.ctx.fns.voice.connections.test({ id: badFixture.view.id, timeoutMs: 5000 });
        expect(checked).toMatchObject({ status: "unavailable", reason: "bad-key", message: "Voice connection check failed" });
        safe(checked);
    });

    test("Invalid chat keyterms fail before any network request", async () => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        await expect(ctx.fns.voice.session.open({
            route: routeOf(view), options: { keywords: ["alpha\nbeta"] }, onEvent: () => {},
        })).rejects.toMatchObject({ code: "protocol" });
        await Bun.sleep(30);
        expect(server.upgrades).toHaveLength(0);
    });
});

