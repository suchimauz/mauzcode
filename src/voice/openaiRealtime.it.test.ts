// Task 2.2 — the real openai-realtime adapter's real WebSocket client against a controlled fake Realtime
// server on numeric loopback with an ephemeral port. No mock WebSocket class, no external traffic, no real
// credentials, no working runtime or user database: mkTestCtx supplies the migrated isolated test Postgres.
// The shared provider contract runs through an upstream driver that speaks native wire events only.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { mkTestCtx } from "../_testCtx.entry";
import provider from "./$voiceProvider_openai-realtime";
import { runVoiceProviderContract } from "./contract/providerContract.entry";
import type { ContractFixture } from "./contract/providerContract.entry";
import { pcmChunk, concatFrames } from "./contract/contractRecorder.entry";
import { startFakeRealtime, confirmSetup, committed, transcription } from "./contract/openaiRealtimeFake.entry";
import type { FakeRealtimeServer, FakeConnection } from "./contract/openaiRealtimeFake.entry";
import { realtimeUpstream } from "./contract/openaiRealtimeDriver.entry";

// Fixed fake credential — never a real key, and never expected in any event, message or log.
const KEY = "fake-it-voice-key-0123456789abcdef";
const speech = () => pcmChunk({ sampleRate: 24_000, windows: 5, amplitude: 0.5 });
const pause = () => pcmChunk({ sampleRate: 24_000, windows: 30, amplitude: 0 });
// Worker test databases persist between tests in one process; connection account names must stay unique.
let accountSeq = 0;
const routeOf = (view: types.voice.ConnectionView) => `openai-realtime/${view.accountName}:gpt-live-transcribe`;

const servers = new Set<FakeRealtimeServer>();
const sessions = new Set<types.voice.VoiceSession>();
afterEach(async () => {
    for (const session of sessions) { try { await session.cancel(); } catch { /* teardown must not throw */ } }
    sessions.clear();
    for (const server of servers) server.stop();
    servers.clear();
});
afterAll(() => { for (const server of servers) server.stop(); });

// The first context builds the migrated template database; keep that out of per-test timeouts.
beforeAll(async () => { await mkTestCtx(); }, 60_000);

function fake(behavior: Parameters<typeof startFakeRealtime>[0] = {}): FakeRealtimeServer {
    const server = startFakeRealtime(behavior);
    servers.add(server);
    return server;
}

/** Fresh isolated ctx with the real built-in declaration registered and one stored connection to the fake. */
async function makeFixture(server: FakeRealtimeServer, config: Record<string, unknown> = {}, accountName = `work-${accountSeq++}`) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString("base64") } });
    ctx.state.voice ??= {};
    ctx.state.voice.providers = {
        "openai-realtime": {
            owner: "core", module: "voice",
            rel: "voice/$voiceProvider_openai-realtime.ts",
            abs: resolve(import.meta.dir, "$voiceProvider_openai-realtime.ts"),
            definition: provider,
        },
    };
    const view = await ctx.fns.voice.create({
        provider: "openai-realtime", accountName,
        config: { baseUrl: server.baseUrl, ...config },
        secrets: { apiKey: KEY },
    });
    return { ctx, view };
}

async function openSession(ctx: any, route: string, options?: { config?: types.voice.VoiceSessionConfig; options?: types.voice.RecognitionOptions }) {
    const events: types.voice.SessionEvent[] = [];
    const session: types.voice.VoiceSession = await ctx.fns.voice.session.open({
        route, ...options, onEvent: (event: types.voice.SessionEvent) => events.push(event),
    });
    sessions.add(session);
    return { session, events };
}

/** Bounded wait for an observable client-side effect; no fixed sleeps for synchronization. */
async function until(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 4000;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error("timed out waiting for a session effect");
        await Bun.sleep(5);
    }
}

/** Drive one committed phrase through the wire and return its item id. */
async function speak(session: types.voice.VoiceSession, conn: FakeConnection, index: number, previous: string | null): Promise<string> {
    await session.append(speech());
    const sendingPause = session.append(pause());
    await conn.waitReceived("input_audio_buffer.commit", index + 1);
    const id = `item_${index}`;
    await conn.send(committed(id, previous));
    await sendingPause;
    return id;
}

function finals(events: types.voice.SessionEvent[]) {
    return events.filter((e): e is Extract<types.voice.SessionEvent, { type: "phrase" }> => e.type === "phrase" && e.final)
        .map(({ order, text }) => ({ order, text }));
}

/** No vendor payload, key material or raw audio may reach a client event. */
function safeEvents(events: types.voice.SessionEvent[], extra?: unknown) {
    const json = JSON.stringify({ events, extra });
    expect(json).not.toContain(KEY);
    expect(json).not.toContain("Bearer");
    expect(json).not.toContain("fake upstream failure");
    expect(json).not.toContain("transcription_error");
}

// The mandated shared suite: the real adapter, real session core, real WebSocket client — the driver only
// sends and observes native wire events on the fake server.
runVoiceProviderContract({
    name: "openai-realtime (fake realtime socket)",
    setup: async (): Promise<ContractFixture> => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        return { ctx, route: routeOf(view), upstream: realtimeUpstream(server) };
    },
});

describe("openai-realtime against the fake realtime server", () => {
    test("setup: transcription intent URL, auth headers, one update, ready only after confirmation", async () => {
        const server = fake({ manualConfirm: true });
        const { ctx, view } = await makeFixture(server, {
            organization: "org-it-fixture", project: "proj-it-fixture",
            languages: "en,ru", keywords: "alpha, beta", prompt: "Reference spelling", delay: "low",
        });
        const opening = openSession(ctx, routeOf(view));
        const conn = await server.next();
        expect(conn.path).toBe("/v1/realtime?intent=transcription");
        expect(conn.authorization).toBe(`Bearer ${KEY}`);
        expect(conn.organization).toBe("org-it-fixture");
        expect(conn.project).toBe("proj-it-fixture");
        await conn.waitReceived("session.update");
        expect(conn.received).toHaveLength(1);
        expect(conn.received[0]).toEqual({
            type: "session.update",
            session: { type: "transcription", audio: { input: {
                format: { type: "audio/pcm", rate: 24000 },
                noise_reduction: { type: "near_field" },
                transcription: { model: "gpt-live-transcribe", languages: ["en", "ru"], keywords: ["alpha", "beta"], prompt: "Reference spelling", delay: "low" },
                turn_detection: null,
            } } },
        });
        // A session.created alone must not make the session ready.
        await conn.send({ type: "session.created", session: { type: "transcription" } });
        await Bun.sleep(30);
        let opened = false;
        void opening.then(() => { opened = true; });
        await Bun.sleep(30);
        expect(opened).toBe(false);
        await conn.send({ type: "session.updated", session: { type: "transcription" } });
        const { session, events } = await opening;
        expect(events).toEqual([]);
        expect(session.route.sampleRate).toBe(24_000);
        await session.cancel();
        await conn.closed;
        expect(server.connections).toHaveLength(1);
    });

    test("unconfigured options send only model and turn_detection; audio arrives as exact base64 PCM", async () => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        const { session, events } = await openSession(ctx, routeOf(view));
        const conn = await confirmSetup(server);
        expect(conn.received[0]!.session.audio.input.transcription).toEqual({ model: "gpt-live-transcribe" });
        // The core VAD forwards all 5 speech windows and the 25 silence windows up to its commit at
        // 500 ms of silence; leading pre-roll keeps only one silence window, so 5 trailing silent
        // windows are intentionally never sent. Every forwarded byte must arrive exactly once, in order.
        const pcm = concatFrames([speech(), pcmChunk({ sampleRate: 24_000, windows: 25, amplitude: 0 })]);
        await session.append(speech());
        const sendingPause = session.append(pause());
        await conn.waitReceived("input_audio_buffer.commit");
        await sendingPause;
        await conn.send(committed("item_0", null));
        await conn.send(transcription("completed", "item_0", { transcript: "exact audio", usage: { type: "duration", seconds: 0.7 } }));
        expect(await session.finish()).toEqual({ ok: true });
        expect(session.status().usage.audioSeconds).toBeCloseTo(0.7);
        const appends = conn.received.filter(m => m.type === "input_audio_buffer.append");
        expect(appends.length).toBeGreaterThan(0);
        const wireAudio = Buffer.concat(appends.map(m => Buffer.from(String(m.audio), "base64")));
        expect(wireAudio.equals(Buffer.from(pcm))).toBe(true);
        // Only update/append/commit ever reach the service — no response, output audio or tools.
        expect(new Set(conn.received.map(m => m.type))).toEqual(new Set(["session.update", "input_audio_buffer.append", "input_audio_buffer.commit"]));
        expect(JSON.stringify(conn.received)).not.toMatch(/response\.|output_audio|"tools"|"instructions"|"modalities"/);
        expect(finals(events)).toEqual([{ order: 0, text: "exact audio" }]);
        safeEvents(events);
        await conn.closed;
        expect(await conn.closed).toBe(1000);
    });

    test("two phrases split by silence: deltas revise, completed is the full final, FIFO by ack", async () => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        const { session, events } = await openSession(ctx, routeOf(view));
        const conn = await confirmSetup(server);
        const first = await speak(session, conn, 0, null);
        const second = await speak(session, conn, 1, first);
        await conn.send(transcription("delta", first, { delta: "one" }));
        await conn.send(transcription("delta", first, { delta: " phrase" }));
        await conn.send(transcription("completed", first, { transcript: "One phrase." }));
        await conn.send(transcription("delta", second, { delta: "two" }));
        await conn.send(transcription("completed", second, { transcript: "Two phrases." }));
        expect(await session.finish()).toEqual({ ok: true });
        const phrases = events.filter((e): e is Extract<types.voice.SessionEvent, { type: "phrase" }> => e.type === "phrase");
        expect(phrases.map(({ order, revision, text, final }) => ({ order, revision, text, final }))).toEqual([
            { order: 0, revision: 1, text: "one", final: false },
            { order: 0, revision: 2, text: "one phrase", final: false },
            { order: 0, revision: 3, text: "One phrase.", final: true },
            { order: 1, revision: 1, text: "two", final: false },
            { order: 1, revision: 2, text: "Two phrases.", final: true },
        ]);
        expect(conn.received.filter(m => m.type === "input_audio_buffer.commit")).toHaveLength(2);
        expect(events.at(-1)).toEqual({ type: "completed" });
        safeEvents(events);
        await conn.closed;
    });

    test("out-of-order completion keeps commit order; a failed item does not stop later phrases", async () => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        const { session, events } = await openSession(ctx, routeOf(view));
        const conn = await confirmSetup(server);
        const first = await speak(session, conn, 0, null);
        const second = await speak(session, conn, 1, first);
        const third = await speak(session, conn, 2, second);
        await conn.send(transcription("completed", third, { transcript: "third" }));
        await conn.send(transcription("failed", first, { error: { type: "transcription_error", message: KEY } }));
        await conn.send(transcription("completed", second, { transcript: "second" }));
        expect(await session.finish()).toEqual({ ok: true });
        expect(events.find(e => e.type === "phraseFailed")).toMatchObject({ order: 0, reason: "provider" });
        expect(finals(events)).toEqual([{ order: 2, text: "third" }, { order: 1, text: "second" }]);
        safeEvents(events);
        await conn.closed;
    });

    test("a wrong previous_item_id fails the session with a sanitized provider error", async () => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        const { session, events } = await openSession(ctx, routeOf(view));
        const conn = await confirmSetup(server);
        const first = await speak(session, conn, 0, null);
        await session.append(speech());
        const sendingPause = session.append(pause());
        await conn.waitReceived("input_audio_buffer.commit", 2);
        await conn.send(committed("item_1", "not-the-previous-item"));
        await sendingPause;
        expect(await session.finish()).toEqual({ ok: false, code: "provider" });
        expect(events).toEqual([{ type: "error", errorId: expect.stringMatching(/^[0-9a-f]{16}$/), code: "provider", message: "The voice provider failed." }]);
        safeEvents(events);
        await conn.closed;
    });

    test("a refused upgrade (401/403) is a sanitized authorization failure without key material", async () => {
        for (const status of [401, 403]) {
            const server = fake({ refuseUpgrade: status });
            const { ctx, view } = await makeFixture(server);
            const events: types.voice.SessionEvent[] = [];
            let caught: any;
            try {
                await ctx.fns.voice.session.open({ route: routeOf(view), onEvent: (e: types.voice.SessionEvent) => events.push(e) });
            } catch (error) { caught = error; }
            await server.waitUpgrade();
            expect(caught).toMatchObject({ code: "providerAuth", message: "The voice provider rejected the connection credentials." });
            expect(String(caught?.message)).not.toContain(KEY);
            expect(events).toEqual([]);
            expect(server.connections).toHaveLength(0);
            server.stop();
            servers.delete(server);
        }
    });

    for (const [wireCode, cause] of [["rate_limit_exceeded", "rateLimit"], [`unknown-${KEY}`, "unknown"]] as const) {
        test(`the ${cause} diagnostic keeps no credential, transcript, or raw upstream code`, async () => {
            const server = fake();
            const { ctx, view } = await makeFixture(server);
            const { events } = await openSession(ctx, routeOf(view));
            const conn = await confirmSetup(server);
            const transcript = "voice-journal-transcript-canary";
            await conn.send({ type: "error", error: { code: wireCode, message: `${transcript} ${KEY}`, transcript } });
            await until(() => events.some(event => event.type === "error"));
            const event = events[0];
            if (event?.type !== "error" || !event.errorId) throw new Error("Missing terminal reference");
            const rows = await ctx.fns.procs.db.select({ sql: "SELECT * FROM voice_error_journal WHERE id = ?", params: [event.errorId] });
            expect(rows).toMatchObject([{ provider: provider.id, model: "gpt-live-transcribe", stage: "streaming", cause }]);
            const visible = JSON.stringify([rows, events]);
            for (const forbidden of [KEY, transcript, wireCode]) expect(visible).not.toContain(forbidden);
            await conn.closed;
        });
    }

    test("an in-band auth error and a mid-session disconnect end safely with closed codes", async () => {
        // Auth error event after acceptance.
        const authServer = fake();
        const auth = await makeFixture(authServer);
        const a = await openSession(auth.ctx, routeOf(auth.view));
        const authConn = await confirmSetup(authServer);
        await authConn.send({ type: "error", error: { type: "invalid_request_error", code: "invalid_api_key", message: `bad key ${KEY}` } });
        // Let the wire error reach the adapter before finish: a finish without pending phrases may close first.
        await until(() => a.events.some(e => e.type === "error"));
        expect(await a.session.finish()).toEqual({ ok: false, code: "providerAuth" });
        expect(a.events).toEqual([{ type: "error", errorId: expect.stringMatching(/^[0-9a-f]{16}$/), code: "providerAuth", message: "The voice provider rejected the connection credentials." }]);
        safeEvents(a.events);
        await authConn.closed;

        // Abrupt disconnect after a committed phrase: safe provider error, socket released.
        const dropServer = fake();
        const dropped = await makeFixture(dropServer);
        const d = await openSession(dropped.ctx, routeOf(dropped.view));
        const dropConn = await confirmSetup(dropServer);
        await speak(d.session, dropConn, 0, null);
        dropConn.close(1011, "fake upstream failure");
        await dropConn.closed;
        expect(await d.session.finish()).toEqual({ ok: false, code: "provider" });
        expect(d.events).toEqual([{ type: "error", errorId: expect.stringMatching(/^[0-9a-f]{16}$/), code: "provider", message: "The voice provider failed." }]);
        safeEvents(d.events);
    });

    test("connection test confirms the session without sending audio and releases the socket", async () => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        const result = await ctx.fns.voice.connections.test({ id: view.id, timeoutMs: 5000 });
        expect(result).toMatchObject({ status: "available", reason: "voice-ok", message: "Voice connection is ready" });
        const conn = await server.next();
        await conn.closed;
        expect(conn.received.map(m => m.type)).toEqual(["session.update"]);
        expect(server.connections).toHaveLength(1);
        expect(JSON.stringify(result)).not.toContain(KEY);

        // The same check against a refused upgrade reports bad-key, never key material.
        const bad = fake({ refuseUpgrade: 401 });
        const badFixture = await makeFixture(bad);
        const checked = await badFixture.ctx.fns.voice.connections.test({ id: badFixture.view.id, timeoutMs: 5000 });
        expect(checked).toMatchObject({ status: "unavailable", reason: "bad-key", message: "Voice connection check failed" });
        expect(JSON.stringify(checked)).not.toContain(KEY);
        await bad.waitUpgrade();
        expect(bad.connections).toHaveLength(0);
    });

    test("invalid keywords fail before any network request or secret read", async () => {
        const server = fake();
        const { ctx, view } = await makeFixture(server);
        await expect(ctx.fns.voice.session.open({
            route: routeOf(view), options: { keywords: ["alpha\nbeta"] }, onEvent: () => {},
        })).rejects.toMatchObject({ code: "protocol" });
        await Bun.sleep(30);
        expect(server.upgrades).toHaveLength(0);
        expect(server.connections).toHaveLength(0);
    });
});
