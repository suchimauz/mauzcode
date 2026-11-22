import { expect, test, vi } from "bun:test";
import provider from "./$voiceProvider_openai-realtime";
import load from "./$loader_voiceProvider";
import validateConfig from "./connections/validateConfig";

const KEY = "fake-voice-credential";
const context = {} as Context;
const connection = (config: types.voice.ResolvedConnection["config"] = {}): types.voice.ResolvedConnection => ({
    id: "fixture", provider: provider.id, accountName: "test", config,
    secret: async key => {
        expect(key).toBe("apiKey");
        return KEY;
    },
    transport: { kind: "direct" },
    fetch: async () => { throw new Error("no HTTP in this adapter"); },
    // Stands in for the connection-bound client: the adapter must open every socket through this hook.
    openWebSocket: (url, options) => new globalThis.WebSocket(new URL(url) as unknown as string, {
        headers: options?.headers ?? {}, tls: { rejectUnauthorized: true },
    } as unknown as string[]) as unknown as types.voice.BoundWebSocket,
});

function sink(options: types.voice.RecognitionOptions = {}) {
    const controller = new AbortController();
    const events: types.voice.PhraseEvent[] = [];
    const failures: { code: types.voice.ErrorCode; message: string }[] = [];
    const session: types.voice.StreamSession = {
        sampleRate: 24_000, options, signal: controller.signal,
        emit: event => { events.push(event); }, fail: ({ code, message }) => { failures.push({ code, message }); },
    };
    return { session, controller, events, failures };
}

// Local client-side stub; the independent WebSocket server and the reusable SDK contract belong to task 2.2.
async function withSocket(run: (next: Promise<LocalSocket>) => Promise<void>) {
    const created = Promise.withResolvers<LocalSocket>();
    class MockSocket extends LocalSocket {
        constructor(url: URL, opts: { headers: Record<string, string>; tls: { rejectUnauthorized: boolean } }) {
            super(url, opts);
            created.resolve(this);
        }
    }
    const native = globalThis.WebSocket;
    globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
    try { await run(created.promise); } finally { globalThis.WebSocket = native; }
}

class LocalSocket extends EventTarget {
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    readyState = 0;
    bufferedAmount = 0;
    sent: unknown[] = [];
    constructor(readonly url: URL, readonly opts: { headers: Record<string, string>; tls: { rejectUnauthorized: boolean } }) { super(); }
    send(json: string) { this.sent.push(JSON.parse(json)); }
    open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
    close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
    terminate() { this.close(); }
    receive(value: object) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) })); }
    accept() { this.receive({ type: "session.updated", session: { type: "transcription" } }); }
}

const committed = (item_id: string, previous_item_id?: string | null) => ({ type: "input_audio_buffer.committed", item_id, previous_item_id });
const event = (suffix: string, item_id: string, body: object) => ({ type: `conversation.item.input_audio_transcription.${suffix}`, item_id, ...body });
/** PCM16 at 24 kHz: 48 bytes per millisecond. */
const audio = (ms: number) => new Uint8Array(ms * 48).fill(1);
const commits = (socket: LocalSocket) => socket.sent.filter(m => (m as { type: string }).type === "input_audio_buffer.commit");
const appended = (socket: LocalSocket) => (socket.sent as { type: string; audio?: string }[])
    .filter(m => m.type === "input_audio_buffer.append").map(m => Buffer.from(m.audio!, "base64"));

test("built-in catalogue registers and voice connection validation rejects unsafe configuration before saving", async () => {
    const file = import.meta.path.replace("openaiRealtime.unit.test.ts", "$voiceProvider_openai-realtime.ts");
    const ctx = {
        state: { procs: { boot: { entries: [] } } },
        fns: { procs: { modules: { list: () => [{ name: "core", dir: import.meta.dir }] }, log: { warn: () => {}, debug: () => {} } } },
    } as unknown as Context;
    const registered = await load(ctx, null, { entries: [{
        name: provider.id, rel: `voice/$voiceProvider_${provider.id}.ts`, moduleDir: "voice",
        abs: file, root: "core", rootDir: import.meta.dir, mod: { default: provider },
    }] });
    expect(registered).toEqual({ registered: [provider.id], rejected: [] });
    expect(provider.models?.map(model => model.id)).toEqual(["gpt-live-transcribe"]);
    const secrets = { apiKey: KEY };
    const config = (config: Record<string, unknown>) => validateConfig(ctx, null, { provider: provider.id, config, secrets });
    expect((await config({ keywords: "alpha,beta", languages: "en,zh-Hans", delay: "low" })).config).toEqual({
        baseUrl: "https://api.openai.com/v1", keywords: "alpha,beta", languages: "en,zh-Hans", delay: "low",
    });
    for (const [field, value] of [
        ["keywords", "alpha\nbeta"], ["keywords", "<alpha>"], ["languages", "English"], ["delay", "fast"],
        ["baseUrl", "http://example.invalid"], ["baseUrl", "https://example.invalid/v1?model=other"], ["project", "one\r\ntwo"],
    ]) {
        await expect(config({ [field!]: value })).rejects.toMatchObject({
            code: "VALIDATION", field,
            ...(field === "keywords" ? { message: "Keywords must be single-line terms without angle brackets." } : {}),
        });
    }
});

test("invalid per-chat options fail before reading the connection key", async () => {
    let reads = 0;
    const conn = { ...connection(), secret: async () => { reads++; return undefined; } };
    for (const keywords of [["alpha\r"], ["alpha\u2028beta"], ["alpha>"]]) {
        await expect(provider.open(context, conn, sink({ keywords }).session)).rejects.toMatchObject({
            code: "protocol", message: "Keywords must be single-line terms without angle brackets.",
        });
    }
    await expect(provider.open(context, conn, sink({ languages: ["en_US"] }).session)).rejects.toMatchObject({ code: "protocol" });
    expect(reads).toBe(0);
});

test("wire setup is transcription-only and readiness requires session.updated", () => withSocket(async next => {
    let ready = false;
    const { session, controller } = sink({ languages: ["zh-Hans"], delay: "high" });
    try {
        const opening = provider.open(context, connection({ organization: "org-fixture", project: "proj-fixture", languages: "en,ru", keywords: " alpha, beta ", prompt: "Reference spelling" }), session)
            .then(stream => { ready = true; return stream; });
        const socket = await next;
        expect(socket.url.href).toBe("wss://api.openai.com/v1/realtime?intent=transcription");
        expect(socket.opts).toEqual({ headers: { Authorization: `Bearer ${KEY}`, "OpenAI-Organization": "org-fixture", "OpenAI-Project": "proj-fixture" }, tls: { rejectUnauthorized: true } });
        socket.open();
        socket.receive({ type: "session.created" });
        await Promise.resolve();
        expect(ready).toBe(false);
        expect(socket.sent).toEqual([{ type: "session.update", event_id: "mc_0", session: { type: "transcription", audio: { input: {
            format: { type: "audio/pcm", rate: 24000 }, turn_detection: null, noise_reduction: { type: "near_field" },
            transcription: { model: "gpt-live-transcribe", languages: ["zh-Hans"], keywords: ["alpha", "beta"], prompt: "Reference spelling", delay: "high" },
        } } } }]);
        socket.accept();
        const stream = await opening;
        await stream.append(new Uint8Array([8, 1, 2, 9]).subarray(1, 3));
        expect(socket.sent.slice(1)).toEqual([{ type: "input_audio_buffer.append", audio: "AQI=" }]);
        await stream.cancel();
        expect(socket.readyState).toBe(LocalSocket.CLOSED);
    } finally { controller.abort(); }
}));

for (const [upstream, code, cause] of [
    ["invalid_api_key", "providerAuth", "authentication"],
    ["rate_limit_exceeded", "provider", "rateLimit"],
    [`unrecognized-${KEY}`, "provider", "unknown"],
]) {
    test(`upstream failure maps only to ${cause}`, () => withSocket(async next => {
        const transcript = "private dictated sentence";
        const opening = provider.open(context, connection(), sink().session).catch((error: Error) => error);
        const socket = await next;
        socket.open();
        socket.receive({ type: "error", error: { code: upstream, message: `${KEY} ${transcript}`, transcript } });
        const error = await opening;
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({ code, diagnosticCause: cause });
        const output = JSON.stringify(error, Object.getOwnPropertyNames(error));
        expect(output).not.toContain(KEY);
        expect(output).not.toContain(transcript);
    }));
}

test("commit FIFO keeps full revisions by item and finish waits for earlier work", () => withSocket(async next => {
    const { session, controller, events, failures } = sink();
    try {
        const opening = provider.open(context, connection(), session);
        const socket = await next;
        socket.open();
        socket.accept();
        const stream = await opening;
        expect(JSON.stringify(socket.sent)).not.toMatch(/"(?:languages|keywords|prompt|delay)"/);
        await stream.append(audio(200));
        await stream.commit(8);
        await stream.append(audio(200));
        await stream.commit(3);
        const finishing = stream.finish();
        expect(commits(socket)).toEqual([{ type: "input_audio_buffer.commit", event_id: "mc_1" }, { type: "input_audio_buffer.commit", event_id: "mc_2" }]);
        socket.receive(committed("first", null));
        socket.receive(event("delta", "first", { delta: "some" }));
        socket.receive(committed("second", "first"));
        socket.receive(event("completed", "second", { transcript: "later phrase", usage: { type: "duration", seconds: 1.5 } }));
        socket.receive(event("completed", "second", { transcript: "duplicate", usage: { type: "duration", seconds: 1.5 } }));
        expect(socket.readyState).toBe(LocalSocket.OPEN);
        socket.receive(event("delta", "first", { delta: " text" }));
        socket.receive(event("completed", "first", { transcript: "final text" }));
        await finishing;
        expect(events).toEqual([
            { type: "revision", order: 8, text: "some" },
            { type: "usage", audioSeconds: 1.5 },
            { type: "final", order: 3, text: "later phrase" },
            { type: "revision", order: 8, text: "some text" },
            { type: "final", order: 8, text: "final text" },
        ]);
        expect(failures).toEqual([]);
        expect(socket.readyState).toBe(LocalSocket.CLOSED);
    } finally { controller.abort(); }
}));

test("previous_item_id never rejects an item: acks bind FIFO to pending commits", () => withSocket(async next => {
    const { stream, socket, events, failures, controller } = await eventStream(next);
    try {
        await stream.append(audio(200));
        await stream.commit(0);
        await stream.append(audio(200));
        await stream.commit(1);
        socket.receive(committed("first", "unrelated"));
        socket.receive(committed("second", KEY));
        socket.receive(event("completed", "second", { transcript: "two" }));
        socket.receive(event("completed", "first", { transcript: "one" }));
        expect(failures).toEqual([]);
        expect(events).toEqual([{ type: "final", order: 1, text: "two" }, { type: "final", order: 0, text: "one" }]);
        expect(socket.readyState).toBe(LocalSocket.OPEN);
    } finally { controller.abort(); }
}));

test("deltas before the commit acknowledgement are replayed into the bound phrase", () => withSocket(async next => {
    const { stream, socket, events, failures, controller } = await eventStream(next);
    try {
        await stream.append(audio(200));
        socket.receive(event("delta", "early", { delta: "hello" }));
        socket.receive(event("delta", "early", { delta: " world" }));
        expect(events).toEqual([]);
        await stream.commit(4);
        socket.receive(event("completed", "early", { transcript: "Hello world." }));
        expect(events).toEqual([]);
        const finishing = stream.finish();
        socket.receive(committed("early", null));
        await finishing;
        expect(events).toEqual([
            { type: "revision", order: 4, text: "hello" },
            { type: "revision", order: 4, text: "hello world" },
            { type: "final", order: 4, text: "Hello world." },
        ]);
        expect(failures).toEqual([]);
    } finally { controller.abort(); }
}));

test("an empty transcript settles a final empty phrase and the session continues", () => withSocket(async next => {
    const { stream, socket, events, failures, controller } = await eventStream(next);
    try {
        await stream.append(audio(1000));
        await stream.commit(0);
        socket.receive(committed("silence"));
        socket.receive(event("completed", "silence", { transcript: "", usage: { type: "duration", seconds: 1 } }));
        expect(events).toEqual([{ type: "usage", audioSeconds: 1 }, { type: "final", order: 0, text: "" }]);
        expect(failures).toEqual([]);
        expect(socket.readyState).toBe(LocalSocket.OPEN);
    } finally { controller.abort(); }
}));

test("an empty commit is settled locally and a short tail is padded to 100 ms", () => withSocket(async next => {
    const { stream, socket, events, failures, controller } = await eventStream(next);
    try {
        await stream.commit(0);
        expect(commits(socket)).toEqual([]);
        expect(events).toEqual([{ type: "final", order: 0, text: "" }]);
        await stream.append(audio(40));
        await stream.commit(1);
        expect(appended(socket).map(chunk => chunk.byteLength)).toEqual([1920, 2880]);
        expect(appended(socket)[1]!.every(byte => byte === 0)).toBe(true);
        expect(commits(socket)).toHaveLength(1);
        // Exactly 100 ms needs no padding.
        await stream.append(audio(100));
        await stream.commit(2);
        expect(appended(socket).map(chunk => chunk.byteLength)).toEqual([1920, 2880, 4800]);
        await stream.commit(3);
        expect(commits(socket)).toHaveLength(2);
        expect(failures).toEqual([]);
    } finally { controller.abort(); }
}));

test("odd-length frames reach the service as whole PCM16 samples", () => withSocket(async next => {
    const { stream, socket, controller } = await eventStream(next);
    try {
        await stream.append(new Uint8Array([1, 2, 3]));
        await stream.append(new Uint8Array([4]));
        await stream.append(new Uint8Array([5, 6, 7]));
        expect(appended(socket).map(chunk => [...chunk])).toEqual([[1, 2], [3, 4], [5, 6]]);
    } finally { controller.abort(); }
}));

test("a correlated commit error fails only its phrase; later acks bind to later orders", () => withSocket(async next => {
    const { stream, socket, events, failures, controller } = await eventStream(next);
    try {
        await stream.append(audio(200));
        await stream.commit(0);
        await stream.append(audio(200));
        await stream.commit(1);
        const [first] = commits(socket) as { event_id: string }[];
        socket.receive({ type: "error", error: { type: "invalid_request_error", code: "input_audio_buffer_commit_empty", message: KEY, event_id: first!.event_id } });
        expect(events).toEqual([{ type: "failed", order: 0, message: "OpenAI Realtime could not transcribe this phrase." }]);
        const finishing = stream.finish();
        socket.receive(committed("second", null));
        socket.receive(event("completed", "second", { transcript: "kept" }));
        await finishing;
        expect(events.at(-1)).toEqual({ type: "final", order: 1, text: "kept" });
        expect(failures).toEqual([]);
        expect(JSON.stringify(events)).not.toContain(KEY);
    } finally { controller.abort(); }
}));

test("uncorrelated and terminal-class errors still end the session with their classification", () => withSocket(async next => {
    const uncorrelated = await liveStream(next);
    try {
        await uncorrelated.stream.append(audio(200));
        await uncorrelated.stream.commit(0);
        uncorrelated.socket.receive({ type: "error", error: { type: "invalid_request_error", code: "invalid_value", event_id: null } });
        expect(uncorrelated.failures[0]).toMatchObject({ code: "provider", diagnosticReason: "serviceError", diagnosticDetail: "invalid_value", diagnosticCause: "unknown" });
    } finally { uncorrelated.controller.abort(); }
}));

test("a rate limit naming a pending commit is still terminal", () => withSocket(async next => {
    const { stream, socket, failures, controller } = await liveStream(next);
    try {
        await stream.append(audio(200));
        await stream.commit(0);
        const [first] = commits(socket) as { event_id: string }[];
        socket.receive({ type: "error", error: { type: "rate_limit_error", code: "rate_limit_exceeded", event_id: first!.event_id } });
        expect(failures[0]).toMatchObject({ code: "provider", diagnosticReason: "serviceError", diagnosticCause: "rateLimit" });
    } finally { controller.abort(); }
}));

test("an invalid_request_error answering the setup update fails opening and sends no audio", () => withSocket(async next => {
    const { session, controller } = sink();
    const opening = provider.open(context, connection(), session).catch((error: Error) => error);
    const socket = await next;
    socket.open();
    const update = socket.sent[0] as { event_id: string };
    socket.receive({ type: "error", error: { type: "invalid_request_error", code: "invalid_value", event_id: update.event_id } });
    expect(await opening).toMatchObject({ code: "provider", diagnosticReason: "serviceError", diagnosticDetail: "invalid_value" });
    expect(socket.sent).toHaveLength(1);
    expect(socket.readyState).toBe(LocalSocket.CLOSED);
    controller.abort();
}));

test("hundreds of drafts ignore stale item traffic after the bounded duplicate window", () => withSocket(async next => {
    const { stream, socket, events, failures, controller } = await eventStream(next);
    try {
        for (let i = 0; i < 320; i++) {
            await stream.append(audio(100));
            await stream.commit(i);
            if (i > 140) socket.receive(event("completed", `item_${i - 140}`, { transcript: "ancient" }));
            socket.receive(committed(`item_${i}`));
            socket.receive(event("completed", `item_${i}`, { transcript: `${i}` }));
            if (i > 0) {
                socket.receive(event("completed", "item_0", { transcript: "stale" }));
                socket.receive(event("delta", `item_${i - 1}`, { delta: "late" }));
            }
            expect(events.splice(0)).toEqual([{ type: "final", order: i, text: `${i}` }]);
        }
        expect(failures).toEqual([]);
        await stream.finish();
        expect(socket.readyState).toBe(LocalSocket.CLOSED);
    } finally { controller.abort(); }
}));

test("overflowing the pre-acknowledgement buffer is a sequenceMismatch", () => withSocket(async next => {
    const { stream, socket, failures, controller } = await liveStream(next);
    try {
        await stream.append(audio(100));
        for (let index = 0; index <= 8; index++) socket.receive(event("delta", `item_${index}`, { delta: "x" }));
        expect(failures).toHaveLength(1);
        expect(failures[0]).toMatchObject({ code: "provider", diagnosticReason: "sequenceMismatch" });
    } finally { controller.abort(); }
}));

test("cancel while opening rejects silently and ignores late vendor messages", () => withSocket(async next => {
    const { session, controller, events, failures } = sink();
    const opening = provider.open(context, connection(), session);
    const socket = await next;
    socket.open();
    controller.abort(KEY);
    await expect(opening).rejects.toMatchObject({ code: "provider", message: "OpenAI Realtime transcription failed." });
    socket.accept();
    socket.receive(event("delta", "unknown", { delta: KEY }));
    expect(failures).toEqual([]);
    expect(events).toEqual([]);
    expect(socket.readyState).toBe(LocalSocket.CLOSED);
}));

test("session setup and finish have independent deadlines and close their socket", async () => {
    vi.useFakeTimers();
    try {
        await withSocket(async next => {
            const { session } = sink();
            const opening = provider.open(context, connection(), session);
            const socket = await next;
            socket.open();
            const rejection = opening.catch(error => error);
            vi.advanceTimersByTime(5000);
            expect(socket.readyState).toBe(LocalSocket.CLOSED);
            expect(await rejection).toMatchObject({ code: "timeout", message: "OpenAI Realtime session setup timed out." });
        });
        await withSocket(async next => {
            const { session, failures } = sink();
            const opening = provider.open(context, connection(), session);
            const socket = await next;
            socket.open();
            socket.accept();
            const stream = await opening;
            await stream.append(audio(200));
            await stream.commit(0);
            const rejection = stream.finish().catch(error => error);
            vi.advanceTimersByTime(10000);
            expect(socket.readyState).toBe(LocalSocket.CLOSED);
            expect(await rejection).toMatchObject({ code: "timeout" });
            expect(failures).toEqual([{ code: "timeout", message: "OpenAI Realtime did not finish transcribing in time." }]);
        });
    } finally { vi.useRealTimers(); }
});

/** Open one accepted live stream on a local socket and collect the full failure objects it reports. */
async function liveStream(next: Promise<LocalSocket>) {
    const controller = new AbortController();
    const failures: Record<string, unknown>[] = [];
    const session: types.voice.StreamSession = {
        sampleRate: 24_000, options: {}, signal: controller.signal,
        emit: () => {}, fail: error => { failures.push({ ...error }); },
    };
    const opening = provider.open(context, connection(), session);
    const socket = await next;
    socket.open();
    socket.accept();
    return { stream: await opening, socket, failures, controller };
}

for (const code of [1006, 1011]) {
    test(`a live disconnect reports socketClosed with close code ${code} and no close reason`, () => withSocket(async next => {
        const { socket, failures, controller } = await liveStream(next);
        try {
            socket.readyState = 3;
            socket.dispatchEvent(new CloseEvent("close", { code, reason: `${KEY} private reason` }));
            expect(failures).toHaveLength(1);
            expect(failures[0]).toMatchObject({ code: "provider", diagnosticReason: "socketClosed", diagnosticDetail: String(code) });
            expect(JSON.stringify(failures)).not.toContain(KEY);
        } finally { controller.abort(); }
    }));
}

test("a live service error reports serviceError with only a safe identifier", () => withSocket(async next => {
    const { socket, failures, controller } = await liveStream(next);
    try {
        socket.receive({ type: "error", error: { code: "session_expired", type: "invalid_request_error", message: `${KEY} private text` } });
        expect(failures[0]).toMatchObject({ code: "provider", diagnosticCause: "unknown", diagnosticReason: "serviceError", diagnosticDetail: "session_expired" });
        expect(JSON.stringify(failures)).not.toContain(KEY);
    } finally { controller.abort(); }
}));

test("an unsafe service error code falls back to its type, then to no detail", () => withSocket(async next => {
    const first = await liveStream(next);
    try {
        first.socket.receive({ type: "error", error: { code: "Not Safe Code", type: "server_error" } });
        expect(first.failures[0]).toMatchObject({ diagnosticReason: "serviceError", diagnosticDetail: "server_error" });
    } finally { first.controller.abort(); }
}));

test("malformed frames and unknown items are classified without detail", () => withSocket(async next => {
    const { socket, failures, controller } = await liveStream(next);
    try {
        socket.dispatchEvent(new MessageEvent("message", { data: "not json" }));
        expect(failures[0]).toMatchObject({ code: "provider", diagnosticReason: "malformedMessage" });
        expect(failures[0]).not.toHaveProperty("diagnosticDetail");
    } finally { controller.abort(); }
}));

test("an ack with no pending commit or a repeated item is classified as sequenceMismatch", () => withSocket(async next => {
    const unexpected = await liveStream(next);
    try {
        unexpected.socket.receive(committed("first"));
        expect(unexpected.failures[0]).toMatchObject({ code: "provider", diagnosticReason: "sequenceMismatch" });
    } finally { unexpected.controller.abort(); }
}));

test("a duplicate acknowledged item is classified as sequenceMismatch", () => withSocket(async next => {
    const { stream, socket, failures, controller } = await liveStream(next);
    try {
        await stream.append(audio(200));
        await stream.commit(0);
        await stream.append(audio(200));
        await stream.commit(1);
        socket.receive(committed("first"));
        socket.receive(committed("first", "first"));
        expect(failures[0]).toMatchObject({ code: "provider", diagnosticReason: "sequenceMismatch" });
    } finally { controller.abort(); }
}));

/** Open one accepted live stream on a local socket and collect provider events and failures. */
async function eventStream(next: Promise<LocalSocket>) {
    const { session, controller, events, failures } = sink();
    const opening = provider.open(context, connection(), session);
    const socket = await next;
    socket.open();
    socket.accept();
    return { stream: await opening, socket, events, failures, controller };
}
