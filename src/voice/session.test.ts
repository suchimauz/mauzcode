import { describe, expect, test } from "bun:test";
import { createSessionFixture, tone } from "./contract/sessionFixture.entry";

// The session core's own guarantees, independent of segmentation: identity, order, revisions, generations, cancel,
// bounded finish, backpressure and sanitized failures. Each test opens one session and ends it, so a failing case
// cannot leave a session behind.

const RATE = 24000;

function deferred() {
    return Promise.withResolvers<void>();
}

describe("session lifecycle", () => {
    test("open resolves the route once and reports the destination before any transcript", async () => {
        const { ctx, route } = await createSessionFixture({ providerId: "core-route" });
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: any) => events.push(event) });
        expect(session.route.route).toBe(route);
        expect(session.route.provider).toBe("core-route");
        expect(session.route.modelId).toBe("fixture-live");
        expect(session.route.destination).toEqual({ kind: "cloud", label: "Fixture (fixture.invalid)" });
        expect(session.route.sampleRate).toBe(24000);
        expect(events).toEqual([]);
        expect(session.status()).toMatchObject({ state: "open", committed: 0, settled: 0 });
        await session.cancel();
    });

    test("an unavailable route fails with routeUnavailable and never falls back to another route", async () => {
        const { ctx } = await createSessionFixture({ providerId: "core-missing" });
        await expect(ctx.fns.voice.session.open({ route: "core-missing/work:no-such-model", onEvent: () => {} }))
            .rejects.toMatchObject({ code: "routeUnavailable" });
        await expect(ctx.fns.voice.session.open({ route: "other/work:fixture-live", onEvent: () => {} }))
            .rejects.toMatchObject({ code: "routeUnavailable" });
    });

    test("a provider that cannot open reports one safe code without its own message", async () => {
        const { ctx, route } = await createSessionFixture({
            providerId: "core-open-fail",
            openError: { code: "providerAuth", message: "401 invalid_api_key=sk-live-abcdef" },
        });
        const error = await ctx.fns.voice.session.open({ route, onEvent: () => {} }).catch((thrown: unknown) => thrown as any);
        expect(error.code).toBe("providerAuth");
        expect(error.message).toBe("The voice provider rejected the connection credentials.");
        expect(String(error.message)).not.toContain("sk-live");
    });

    test("an unknown provider code is closed to provider rather than forwarded", async () => {
        const { ctx, route } = await createSessionFixture({
            providerId: "core-open-odd",
            openError: { code: "SOMETHING_VENDOR", message: "vendor detail" },
        });
        const error = await ctx.fns.voice.session.open({ route, onEvent: () => {} }).catch((thrown: unknown) => thrown as any);
        expect(error.code).toBe("provider");
        expect(error.message).toBe("The voice provider failed.");
    });

    test("fail during open rejects immediately and releases a handle returned later", async () => {
        const returnHandle = deferred();
        const released = deferred();
        const { ctx, route, recorder } = await createSessionFixture({
            providerId: "core-open-terminal",
            wrapOpen: async (stream, sink) => {
                sink.fail({ code: "providerAuth", message: "private detail" });
                await returnHandle.promise;
                return {
                    ...stream,
                    cancel: async () => { await stream.cancel(); released.resolve(); },
                };
            },
        });
        const events: types.voice.SessionEvent[] = [];
        try {
            await expect(ctx.fns.voice.session.open({ route, onEvent: (event: types.voice.SessionEvent) => events.push(event) }))
                .rejects.toMatchObject({ code: "providerAuth", message: "The voice provider rejected the connection credentials." });
            expect(recorder.session()?.signal.aborted).toBe(true);
            expect(events).toEqual([]); // Opening rejection is the single failure channel.
        } finally {
            returnHandle.resolve();
        }
        await released.promise;
        expect(recorder.cancels).toBe(1);
    }, 1500);

    test("a session that throws from its consumer keeps working", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-consumer" });
        recorder.autoFinal = () => "text";
        const session = await ctx.fns.voice.session.open({
            route,
            onEvent: () => { throw new Error("consumer exploded"); },
        });
        const pcm = tone(RATE);
        await session.append(pcm.speech(5));
        const result = await session.finish();
        expect(result.ok).toBe(true);
        expect(recorder.commits).toEqual([0]);
    });
});

describe("phrase identity and revisions", () => {
    test("phrase ids are stable per order and revisions only ever increase", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-revise" });
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: any) => events.push(event) });
        const pcm = tone(RATE);
        await session.append(pcm.speech(5));
        await session.append(pcm.silence(30));
        recorder.emit({ type: "revision", order: 0, text: "hel" });
        recorder.emit({ type: "revision", order: 0, text: "hello" });
        recorder.emit({ type: "revision", order: 0, text: "hello there" });
        recorder.emit({ type: "final", order: 0, text: "Hello there." });
        // A provider that keeps revising after its final must not add a second terminal revision.
        recorder.emit({ type: "revision", order: 0, text: "late" });
        recorder.emit({ type: "final", order: 0, text: "later" });
        const result = await session.finish();
        expect(result.ok).toBe(true);

        const phrases = events.filter((event: any) => event.type === "phrase") as any[];
        expect(phrases.map(entry => entry.revision)).toEqual([1, 2, 3, 4]);
        expect(new Set(phrases.map(entry => entry.id))).toEqual(new Set([phrases[0]!.id]));
        // Each revision is the complete text, never a delta.
        expect(phrases.map(entry => entry.text)).toEqual(["hel", "hello", "hello there", "Hello there."]);
        expect(phrases.filter(entry => entry.final)).toHaveLength(1);
        expect(phrases.at(-1)!.text).toBe("Hello there.");
    });

    test("an event for an order core never committed is dropped", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-unknown" });
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: any) => events.push(event) });
        recorder.emit({ type: "final", order: 42, text: "ghost" });
        recorder.emit({ type: "revision", order: -1, text: "negative" });
        recorder.emit({ type: "revision", order: 1.5, text: "fractional" });
        expect(events).toEqual([]);
        await session.cancel();
    });

    test("interleaved events for two committed phrases stay separate", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-interleave" });
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: any) => events.push(event) });
        const pcm = tone(RATE);
        await session.append(pcm.speech(5));
        await session.append(pcm.silence(30));
        await session.append(pcm.speech(5));
        await session.append(pcm.silence(30));
        recorder.emit({ type: "revision", order: 0, text: "first partial" });
        recorder.emit({ type: "revision", order: 1, text: "second partial" });
        recorder.emit({ type: "revision", order: 0, text: "first more" });
        recorder.emit({ type: "final", order: 1, text: "second final" });
        recorder.emit({ type: "final", order: 0, text: "first final" });
        const result = await session.finish();
        expect(result.ok).toBe(true);

        const byOrder = (order: number) => (events.filter((event: any) => event.type === "phrase" && event.order === order) as any[]);
        expect(byOrder(0).map(entry => entry.text)).toEqual(["first partial", "first more", "first final"]);
        expect(byOrder(1).map(entry => entry.text)).toEqual(["second partial", "second final"]);
        expect(byOrder(0).map(entry => entry.id)[0]).not.toBe(byOrder(1).map(entry => entry.id)[0]);
        expect(byOrder(0).at(-1)!.final).toBe(true);
        expect(byOrder(1).at(-1)!.final).toBe(true);
    });
});

describe("generations and stale callbacks", () => {
    test("a provider callback kept across cancel delivers nothing", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-stale" });
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: any) => events.push(event) });
        const pcm = tone(RATE);
        await session.append(pcm.speech(5));
        await session.append(pcm.silence(30));
        const sink = recorder.session()!;
        await session.cancel();
        const after = events.length;
        // The provider still holds its sink: everything it reports now belongs to a generation that ended.
        sink.emit({ type: "revision", order: 0, text: "stale" });
        sink.emit({ type: "final", order: 0, text: "stale final" });
        sink.emit({ type: "usage", audioSeconds: 5 });
        sink.fail({ code: "provider", message: "stale failure" });
        expect(events.slice(after)).toEqual([]);
        expect(session.status().usage.audioSeconds).toBe(0);
    });

    test("a superseded takeover delivers one explicit error before closing", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-supersede" });
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: any) => events.push(event) });
        const first = session.status().generation;
        await session.cancel("superseded");
        const errors = events.filter((event: any) => event.type === "error") as any[];
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ code: "superseded", message: "Dictation moved to another tab." });
        // The generation moved, so a provider event from before the takeover is stale.
        expect(session.status().generation).toBeGreaterThan(first);
        expect(recorder.cancels).toBe(1);
        // A second cancel is idempotent and never reports a second error.
        await session.cancel("superseded");
        expect(events.filter((event: any) => event.type === "error")).toHaveLength(1);
        expect(recorder.cancels).toBe(1);
    });

    test("losing edit access ends the session with readOnly and no further phrase", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-readonly" });
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: any) => events.push(event) });
        const pcm = tone(RATE);
        await session.append(pcm.speech(5));
        await session.append(pcm.silence(30));
        await session.cancel("readOnly");
        recorder.emit({ type: "final", order: 0, text: "must not arrive" });
        const errors = events.filter((event: any) => event.type === "error") as any[];
        expect(errors.map(entry => entry.code)).toEqual(["readOnly"]);
        expect(events.some((event: any) => event.type === "phrase")).toBe(false);
        // The provider stream was released, not left running.
        expect(recorder.cancels).toBe(1);
    });
});

describe("bounds", () => {
    test("a stalled append ends the session with backpressure instead of dropping audio", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-backpressure" });
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: any) => events.push(event) });
        recorder.hangAppend = true;
        const pcm = tone(RATE);
        // Push well past the 1 MiB ceiling: the provider never accepts, so the session must end visibly.
        const frame = pcm.speech(50); // 50 windows = 48 000 bytes
        const pushes: Promise<void>[] = [];
        for (let index = 0; index < 40; index++) pushes.push(session.append(frame));
        await Promise.all(pushes);
        const errors = events.filter((event: any) => event.type === "error") as any[];
        expect(errors.map(entry => entry.code)).toEqual(["backpressure"]);
        expect(events.some((event: any) => event.type === "phrase")).toBe(false);
        await session.cancel();
    });

    test("a hung cancel still releases the session", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-hung-cancel" });
        const session = await ctx.fns.voice.session.open({
            route,
            config: { cancelTimeoutMs: 150 },
            onEvent: () => {},
        });
        recorder.hang = true;
        const started = Date.now();
        await session.cancel();
        expect(Date.now() - started).toBeLessThan(5000);
        expect(session.status().state).toBe("closed");
    });

    for (const pending of [false, true]) {
        test(`rejecting provider finish fails safely ${pending ? "with" : "without"} a pending phrase`, async () => {
            const { ctx, route, recorder } = await createSessionFixture({
                providerId: "core-finish-reject",
                wrapOpen: async stream => ({
                    ...stream,
                    finish: async () => { throw new Error("private vendor detail"); },
                }),
            });
            const events: types.voice.SessionEvent[] = [];
            const session: types.voice.VoiceSession = await ctx.fns.voice.session.open({
                route, config: { finishTimeoutMs: 100 }, onEvent: (event: types.voice.SessionEvent) => events.push(event),
            });
            if (pending) await session.append(tone(RATE).speech(2));
            expect(await session.finish()).toEqual({ ok: false, code: "provider" });
            expect(session.status().committed).toBe(pending ? 1 : 0);
            expect(events).toEqual([{ type: "error", code: "provider", message: "The voice provider failed." }]);
            expect(recorder.cancels).toBe(1);
            expect(recorder.session()?.signal.aborted).toBe(true);
        });
    }

    for (const stage of ["queued-append", "flush-append", "flush-commit"] as const) {
        test(`finish deadline includes a stalled ${stage} and drops late results`, async () => {
            const invoked = deferred();
            const late = deferred();
            const returned = deferred();
            const { ctx, route, recorder } = await createSessionFixture({
                providerId: "core-finish-stall",
                wrapOpen: async (stream, sink) => {
                    const stall = async () => {
                        invoked.resolve();
                        await late.promise;
                        sink.emit({ type: "final", order: 0, text: "late result" });
                        sink.fail({ code: "providerAuth", message: "late failure" });
                        returned.resolve();
                    };
                    return stage === "flush-commit"
                        ? { ...stream, commit: async order => { await stream.commit(order); await stall(); } }
                        : { ...stream, append: async pcm => { await stream.append(pcm); await stall(); } };
                },
            });
            const events: types.voice.SessionEvent[] = [];
            const session: types.voice.VoiceSession = await ctx.fns.voice.session.open({
                route, config: { finishTimeoutMs: 100 }, onEvent: (event: types.voice.SessionEvent) => events.push(event),
            });
            const push = session.append(tone(RATE).speech(stage === "queued-append" ? 30 : 2));
            if (stage === "queued-append") await invoked.promise;
            else await push;
            const finish = session.finish();
            try {
                await invoked.promise;
                expect(await finish).toEqual({ ok: false, code: "timeout" });
                expect(recorder.session()?.signal.aborted).toBe(true);
                expect(recorder.cancels).toBe(1);
                await push; // Core's queue unblocks even though the provider has not returned.
            } finally {
                late.resolve();
            }
            await returned.promise;
            await session.cancel();
            expect(recorder.finishes).toBe(0);
            expect(recorder.commits).toEqual(stage === "flush-commit" ? [0] : []);
            expect(recorder.cancels).toBe(1);
            expect(events).toEqual([{ type: "error", code: "timeout", message: "Voice recognition timed out." }]);
        }, 1500);
    }

    for (const terminal of ["provider", "cancel"] as const) {
        test(`${terminal} ends a hung finish without waiting for its deadline or a client retry`, async () => {
            const invoked = deferred();
            const { ctx, route, recorder } = await createSessionFixture({
                providerId: "core-finish-abort",
                wrapOpen: async stream => ({
                    ...stream, finish: () => { invoked.resolve(); return new Promise<void>(() => {}); },
                }),
            });
            const events: types.voice.SessionEvent[] = [];
            const session: types.voice.VoiceSession = await ctx.fns.voice.session.open({
                route, config: { finishTimeoutMs: 10_000 }, onEvent: (event: types.voice.SessionEvent) => events.push(event),
            });
            const finish = session.finish();
            await invoked.promise;
            if (terminal === "provider") recorder.fail("providerAuth");
            else await session.cancel();
            const expectedCode = terminal === "provider" ? "providerAuth" : undefined;
            expect(await finish).toEqual(expectedCode ? { ok: false, code: expectedCode } : { ok: false });
            expect(recorder.session()?.signal.aborted).toBe(true);
            expect(recorder.cancels).toBe(1);
            recorder.fail("provider");
            await session.cancel("superseded");
            expect(recorder.cancels).toBe(1);
            expect(events).toEqual(expectedCode ? [{
                type: "error", code: expectedCode, message: "The voice provider rejected the connection credentials.",
            }] : []);
        }, 1500);
    }

    test("finish reports a provider that resolves without settling its phrases", async () => {
        const { ctx, route } = await createSessionFixture({ providerId: "core-unsettled" });
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({
            route,
            config: { finishTimeoutMs: 400 },
            onEvent: (event: any) => events.push(event),
        });
        const pcm = tone(RATE);
        await session.append(pcm.speech(5));
        await session.append(pcm.silence(30));
        // No autoFinal: the provider accepted the commit but will never report a phrase.
        const result = await session.finish();
        expect(result).toMatchObject({ ok: false, code: "timeout" });
        expect(events.filter((event: any) => event.type === "error").map((entry: any) => entry.code)).toEqual(["timeout"]);
    });

    test("usage is counted in memory, not emitted, and frozen on cancellation", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-usage" });
        const events: types.voice.SessionEvent[] = [];
        const session: types.voice.VoiceSession = await ctx.fns.voice.session.open({
            route, onEvent: (event: types.voice.SessionEvent) => events.push(event),
        });
        recorder.emit({ type: "usage", audioSeconds: 1.5 });
        recorder.emit({ type: "usage", audioSeconds: 2 });
        expect(session.status().usage.audioSeconds).toBe(3.5);
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT to_regclass('voice_sessions') AS t" });
        expect(rows[0]?.t ?? null).toBeNull();
        await session.cancel();
        recorder.emit({ type: "usage", audioSeconds: 9 });
        expect(session.status().usage.audioSeconds).toBe(3.5);
        expect(events).toEqual([]);
    });

    test("status reports counters without any audio or transcript", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-status" });
        recorder.autoFinal = () => "secret transcript text";
        const session = await ctx.fns.voice.session.open({ route, onEvent: () => {} });
        const pcm = tone(RATE);
        await session.append(pcm.speech(5));
        await session.append(pcm.silence(30));
        recorder.emit({ type: "usage", audioSeconds: 2.25 });
        const status = session.status();
        expect(status.committed).toBe(1);
        expect(status.settled).toBe(1);
        expect(status.usage.audioSeconds).toBe(2.25);
        expect(JSON.stringify(status)).not.toContain("secret transcript text");
        expect(JSON.stringify(status)).not.toContain("Uint8Array");
        const result = await session.finish();
        expect(result.ok).toBe(true);
    });

    test("explicit commit closes the current phrase and returns its order", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "core-explicit" });
        recorder.autoFinal = (order: number) => `phrase ${order}`;
        const session = await ctx.fns.voice.session.open({ route, onEvent: () => {} });
        const pcm = tone(RATE);
        await session.append(pcm.speech(5));
        const order = await session.commit();
        expect(order).toBe(0);
        expect(recorder.commits).toEqual([0]);
        // Nothing was said since the last commit, so a second explicit commit has nothing to close.
        expect(await session.commit()).toBeUndefined();
        expect(await session.finish()).toEqual({ ok: true });
    });
});
