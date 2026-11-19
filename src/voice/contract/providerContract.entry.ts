/**
 * Shared conformance scenarios over the real session core and a controllable upstream.
 *
 * `setup` registers the provider under test and returns a driver for its fake upstream. For a real adapter the
 * driver must send the adapter's native wire events, never call `session.emit` or replace the adapter's stream.
 * The in-process fixture translates these same actions directly, since it has no wire protocol. Driver methods
 * are async so a socket fixture can synchronize delivery without sleeps. No real credentials or services are used.
 */
import { describe, expect, test } from "bun:test";
import { pcmChunk } from "./contractRecorder.entry";

export type ContractUpstream = {
    /** Wait for the indexed core-requested commit and acknowledge it upstream; return its upstream phrase id. */
    acceptCommit: (index: number) => Promise<string>;
    /** Wait for the scripted audio, report a provider-selected boundary at the given PCM offset and return its id. */
    reportTurn: (endByte: number) => Promise<string>;
    /** Deliver a partial hypothesis. A delta-based transport translates this into native deltas or replacements. */
    revise: (id: string, text: string) => Promise<void>;
    /** Deliver a final hypothesis. */
    finalize: (id: string, text: string) => Promise<void>;
    /** Deliver a failed phrase without failing the session. */
    failPhrase: (id: string) => Promise<void>;
    /** Fail the active session through the upstream protocol or transport. */
    disconnect: () => Promise<void>;
    /** Verify upstream resources were released; await any observable close handshake. */
    expectClosed: () => Promise<void>;
};

export type ContractFixture = {
    /** Test context with the provider declaration registered and its connection stored. */
    ctx: any;
    /** Exact `<provider>/<account>:<model>` route of that connection. */
    route: string;
    /** Driver for controlled upstream messages and observations. */
    upstream: ContractUpstream;
};

export type ContractSuiteOptions = {
    /** Suite label, normally the provider id. */
    name: string;
    /** Build a fresh fixture for each test. */
    setup: () => Promise<ContractFixture>;
};

/** Produce one committed phrase and a native identifier without assuming ids equal normalized order. */
async function speak(session: types.voice.VoiceSession, upstream: ContractUpstream, index: number): Promise<string> {
    const sampleRate = session.route.sampleRate;
    const speech = pcmChunk({ sampleRate, windows: 5, amplitude: 0.5 });
    const pause = pcmChunk({ sampleRate, windows: 30, amplitude: 0 });
    await session.append(speech);
    const sendingPause = session.append(pause);
    // A provider is allowed to wait for upstream acknowledgement before its commit promise resolves.
    const id = session.route.model.capabilities.turnDetection === "server"
        ? await upstream.reportTurn(index * (speech.byteLength + pause.byteLength) + speech.byteLength)
        : await upstream.acceptCommit(index);
    await sendingPause;
    return id;
}

function phrases(events: types.voice.SessionEvent[]): Extract<types.voice.SessionEvent, { type: "phrase" }>[] {
    return events.filter((event): event is Extract<types.voice.SessionEvent, { type: "phrase" }> => event.type === "phrase");
}

/** Run the same normalized transcript assertions for an in-process fixture or a real adapter with a fake upstream. */
export function runVoiceProviderContract(opts: ContractSuiteOptions): void {
    const open = async () => {
        const { ctx, route, upstream } = await opts.setup();
        const events: types.voice.SessionEvent[] = [];
        const session: types.voice.VoiceSession = await ctx.fns.voice.session.open({
            route, onEvent: (event: types.voice.SessionEvent) => events.push(event),
        });
        return { session, route, events, upstream };
    };

    describe(`voice provider contract: ${opts.name}`, () => {
        test("start reports the selected route and destination before any transcript", async () => {
            const { session, route, events } = await open();
            try {
                expect(session.route.route).toBe(route);
                expect(session.route.destination.label).not.toBe("");
                expect(session.route.sampleRate).toBeGreaterThan(0);
                expect(session.sessionId).not.toBe("");
                expect(events).toEqual([]);
            } finally {
                await session.cancel();
            }
        });

        test("partial hypotheses become increasing revisions of one phrase and one final", async () => {
            const { session, events, upstream } = await open();
            try {
                const id = await speak(session, upstream, 0);
                await upstream.revise(id, "one");
                await upstream.revise(id, "one phrase");
                await upstream.finalize(id, "One phrase.");
                await upstream.finalize(id, "duplicate");
                expect(await session.finish()).toEqual({ ok: true });
                const updates = phrases(events);
                expect(updates.map(({ order, revision, text, final }) => ({ order, revision, text, final }))).toEqual([
                    { order: 0, revision: 1, text: "one", final: false },
                    { order: 0, revision: 2, text: "one phrase", final: false },
                    { order: 0, revision: 3, text: "One phrase.", final: true },
                ]);
                expect(new Set(updates.map(entry => entry.id)).size).toBe(1);
                expect(events.at(-1)).toEqual({ type: "completed" });
            } finally {
                await session.cancel();
            }
        });

        test("finals arriving in reverse order retain commit order and distinct identities", async () => {
            const { session, events, upstream } = await open();
            try {
                const first = await speak(session, upstream, 0);
                const second = await speak(session, upstream, 1);
                await upstream.finalize(second, "second");
                await upstream.finalize(first, "first");
                expect(await session.finish()).toEqual({ ok: true });
                const finals = phrases(events).filter(event => event.final);
                expect(finals.map(({ order, text }) => ({ order, text }))).toEqual([
                    { order: 1, text: "second" }, { order: 0, text: "first" },
                ]);
                expect(new Set(finals.map(entry => entry.id)).size).toBe(2);
            } finally {
                await session.cancel();
            }
        });

        test("a failed phrase does not prevent a later final", async () => {
            const { session, events, upstream } = await open();
            try {
                const first = await speak(session, upstream, 0);
                const second = await speak(session, upstream, 1);
                await upstream.failPhrase(first);
                await upstream.finalize(second, "still delivered");
                expect(await session.finish()).toEqual({ ok: true });
                expect(events.find(event => event.type === "phraseFailed")).toMatchObject({ order: 0, reason: "provider" });
                expect(phrases(events).filter(event => event.final)).toMatchObject([{ order: 1, text: "still delivered" }]);
            } finally {
                await session.cancel();
            }
        });

        test("an upstream disconnect closes with a safe failure and releases resources", async () => {
            const { session, events, upstream } = await open();
            try {
                await upstream.disconnect();
                expect(await session.finish()).toEqual({ ok: false, code: "provider" });
                expect(events).toMatchObject([{ type: "error", code: "provider", message: "The voice provider failed." }]);
                await upstream.expectClosed();
            } finally {
                await session.cancel();
            }
        });

        test("cancel releases resources and late upstream events cannot change the transcript", async () => {
            const { session, events, upstream } = await open();
            try {
                const id = await speak(session, upstream, 0);
                await session.cancel();
                await upstream.expectClosed();
                const count = events.length;
                await upstream.finalize(id, "stale"); // Socket fixtures can drop this after observing closure.
                expect(events).toHaveLength(count);
                expect(session.status().state).toBe("closed");
            } finally {
                await session.cancel();
            }
        });

        test("finish times out and closes when an acknowledged phrase stays pending", async () => {
            const { ctx, route, upstream } = await opts.setup();
            const events: types.voice.SessionEvent[] = [];
            const session: types.voice.VoiceSession = await ctx.fns.voice.session.open({
                route, config: { finishTimeoutMs: 300 }, onEvent: (event: types.voice.SessionEvent) => events.push(event),
            });
            try {
                await speak(session, upstream, 0);
                expect(await session.finish()).toEqual({ ok: false, code: "timeout" });
                expect(events).toMatchObject([{ type: "error", code: "timeout", message: "Voice recognition timed out." }]);
                await upstream.expectClosed();
            } finally {
                await session.cancel();
            }
        });

        test("finish commits one remaining turn and completes only after its final", async () => {
            const { session, events, upstream } = await open();
            try {
                const speech = pcmChunk({ sampleRate: session.route.sampleRate, windows: 5, amplitude: 0.5 });
                await session.append(speech);
                const finish = session.finish();
                const id = await upstream.acceptCommit(0);
                expect(events).toEqual([]);
                await upstream.finalize(id, "last phrase");
                expect(await finish).toEqual({ ok: true });
                expect(await session.finish()).toEqual({ ok: false });
                expect(events.map(event => event.type)).toEqual(["phrase", "completed"]);
                await upstream.expectClosed();
            } finally {
                await session.cancel();
            }
        });
    });
}
