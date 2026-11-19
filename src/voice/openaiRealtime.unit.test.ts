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
        expect(socket.sent).toEqual([{ type: "session.update", session: { type: "transcription", audio: { input: {
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
        await stream.commit(8);
        await stream.commit(3);
        const finishing = stream.finish();
        expect(socket.sent.slice(1)).toEqual([{ type: "input_audio_buffer.commit" }, { type: "input_audio_buffer.commit" }]);
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

test("a wrong predecessor is a safe session failure, not a way to choose a commit", () => withSocket(async next => {
    const { session, controller, events, failures } = sink();
    try {
        const opening = provider.open(context, connection(), session);
        const socket = await next;
        socket.open();
        socket.accept();
        const stream = await opening;
        await stream.commit(0);
        await stream.commit(1);
        socket.receive(committed("first"));
        socket.receive(committed("second", KEY));
        expect(failures).toEqual([{ code: "provider", message: "OpenAI Realtime transcription failed." }]);
        expect(events).toEqual([]);
        expect(socket.readyState).toBe(LocalSocket.CLOSED);
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

test("a predecessor mismatch is classified as sequenceMismatch", () => withSocket(async next => {
    const { stream, socket, failures, controller } = await liveStream(next);
    try {
        await stream.commit(0);
        await stream.commit(1);
        socket.receive(committed("first"));
        socket.receive(committed("second", "other"));
        expect(failures[0]).toMatchObject({ code: "provider", diagnosticReason: "sequenceMismatch" });
    } finally { controller.abort(); }
}));
