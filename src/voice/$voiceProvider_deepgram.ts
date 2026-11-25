const MODEL = "nova-3";
const SAMPLE_RATE = 16_000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2;
// 50 ms of PCM16 at 16 kHz: upstream pacing stays predictable and every frame holds whole samples.
const FRAME_BYTES = 1600;
const BASE_URL = "https://api.deepgram.com";
const DEFAULT_HOST = new URL(BASE_URL).host;
const OPEN_TIMEOUT_MS = 5_000;
const FINISH_TIMEOUT_MS = 10_000;
// Bounded wait for the service to close after CloseStream.
const CLOSE_WAIT_MS = 5_000;
// The service closes an idle stream after about 10 s without audio or KeepAlive (NET-0001).
const KEEPALIVE_MS = 4_000;
const KEEPALIVE_CHECK_MS = 500;
// A Finalize that the service never answers settles after this quiet period, refreshed by every result.
const QUIET_MS = 2_000;
// Allowed drift between our byte count and the service's start/duration seconds.
const TOLERANCE_SEC = 0.05;
const MAX_BUFFER_BYTES = 1024 * 1024;
const MAX_OPEN_SEGMENTS = 256;
const MAX_OPTION_CHARS = 4000;
const MAX_KEYTERMS = 100;
const MAX_KEYTERM_CHARS = 100;
const SOCKET_OPEN = 1;
const SOCKET_CLOSED = 3;
const INVALID_TERM = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/;
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

type Config = Readonly<Record<string, types.voice.ConfigValue>>;
type ConfigIssue = NonNullable<ReturnType<NonNullable<types.voice.ProviderDefinition["validateConfig"]>>>;
type StreamError = Error & { code: types.voice.ErrorCode };
type Settings = { url: URL; languages?: string[]; keyterms?: string[]; smartFormat: boolean; mipOptOut: boolean };
/** One core commit: its audio end in stream seconds and the text the service attributed to it so far. */
type Commit = {
    order: number;
    endSec: number;
    empty: boolean;
    finals: string[];
    interim: string;
    done: boolean;
    shown: string;
    timer?: ReturnType<typeof setTimeout>;
};
/** A final segment that arrived for audio after the last commit; the next commit takes it over. */
type Segment = { start: number; text: string };

const provider: types.voice.ProviderDefinition = {
    id: "deepgram",
    label: "Deepgram live transcription",
    description: "Streams audio from the MauzCode server to Deepgram Nova-3 live transcription.",
    destination: { kind: "cloud", label: "Deepgram (api.deepgram.com or the host of the configured Base URL)" },
    // The disclosure of one stored connection: host and port of the endpoint it actually uses, nothing else.
    destinationFor(config) {
        let url: URL;
        try { url = connectionSettings(config).url; } catch { return undefined; }
        return url.host === DEFAULT_HOST
            ? { kind: "cloud", label: `Deepgram (${url.host})` }
            : { kind: "cloud", label: `Configured endpoint (${url.host})` };
    },
    // Every upstream socket (check and live session) is opened through conn.openWebSocket, so all routes work.
    transports: ["direct", "socks", "ssh-tunnel"],
    fields: [
        { key: "apiKey", label: "API key", type: "secret", required: true },
        { key: "baseUrl", label: "Base URL", type: "url", default: BASE_URL, help: "HTTPS API base URL without a query or fragment, for example https://api.eu.deepgram.com." },
        { key: "languages", label: "Languages", type: "text", help: "Comma-separated language codes, for example ru, en. Empty or several codes use multilingual recognition." },
        { key: "keyterms", label: "Keyterms", type: "text", help: "Comma-separated terms on one line, at most 100. They are sent in the request URL and can appear in Deepgram usage logs." },
        { key: "smartFormat", label: "Smart formatting", type: "boolean", default: true, help: "Punctuation, numerals and other formatting in the transcript." },
        { key: "mipOptOut", label: "Opt out of the Model Improvement Program", type: "boolean", default: false, help: "Deepgram bills opted-out audio at a higher rate." },
    ],
    models: [{
        id: MODEL,
        label: "Nova-3",
        description: "Live transcription, metered per audio minute.",
        capabilities: { turnDetection: "client", sampleRates: [SAMPLE_RATE], languages: true, keywords: true },
    }],
    validateConfig(config) {
        try { connectionSettings(config); } catch (error) {
            if (error instanceof InvalidField) return { field: error.field, reason: error.reason };
            throw error;
        }
    },
    async test(_ctx, conn) {
        try {
            const stream = await openListen(conn, {
                sampleRate: SAMPLE_RATE, options: {}, signal: conn.signal ?? new AbortController().signal,
                emit: () => {}, fail: () => {},
            }, true);
            // No audio: finish sends CloseStream and waits for the service to close the socket.
            await stream.finish();
            return { status: "available", reason: "voice-ok", message: "Voice connection is ready", checkedAt: Date.now() };
        } catch (error) {
            const code = (error as StreamError).code;
            const reason = code === "providerAuth" ? "bad-key" : code === "timeout" ? "timeout" : "unreachable";
            return { status: "unavailable", reason, message: "Voice connection check failed", checkedAt: Date.now() };
        }
    },
    open: (_ctx, conn, session) => openListen(conn, session, false),
};

export default provider;

class InvalidField extends Error implements ConfigIssue {
    constructor(readonly field: string, message: string, readonly reason?: ConfigIssue["reason"]) { super(message); }
}

function connectionSettings(config: Config): Settings {
    let url: URL | undefined;
    const base = config.baseUrl ?? BASE_URL;
    if (typeof base === "string" && base.length <= 2048) {
        try { url = new URL(base); } catch { /* Fixed error below. */ }
    }
    // TLS is required outside exact numeric loopback; do not trust DNS names for the local test exception.
    const loopback = url?.hostname === "127.0.0.1" || url?.hostname === "[::1]";
    if (!url || !(url.protocol === "https:" || (url.protocol === "http:" && loopback)) ||
        url.username || url.password || /[?#]/.test(url.href)) {
        throw new InvalidField("baseUrl", "Base URL must be a credential-free HTTPS URL without a query or fragment (HTTP only on numeric loopback).", "httpsEndpoint");
    }
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/v1/listen`;
    return {
        url,
        ...(config.languages !== undefined ? { languages: termList("languages", config.languages, true) } : {}),
        ...(config.keyterms !== undefined ? { keyterms: termList("keyterms", config.keyterms, true) } : {}),
        smartFormat: config.smartFormat !== false,
        mipOptOut: config.mipOptOut === true,
    };
}

/** Parse a comma-separated connection value or a per-chat list into trimmed, validated terms. */
function termList(field: "languages" | "keyterms", value: unknown, commaSeparated: boolean): string[] {
    const invalid = () => field === "keyterms"
        ? new InvalidField(field, "Keyterms must be at most 100 single-line terms.", "keywordList")
        : new InvalidField(field, "Languages must be comma-separated language tags.", "languageList");
    const list: unknown = commaSeparated ? (typeof value === "string" && value.length <= MAX_OPTION_CHARS ? [value] : undefined) : value;
    if (!Array.isArray(list) || list.length > MAX_OPTION_CHARS) throw invalid();
    const terms: string[] = [];
    let length = 0;
    for (const item of list) {
        if (typeof item !== "string" || (length += item.length + 1) > MAX_OPTION_CHARS || INVALID_TERM.test(item)) throw invalid();
        // A comma inside one keyterm boosts nothing at the service: every comma separates terms.
        for (const term of item.split(",")) {
            const trimmed = term.trim();
            if (!trimmed) continue;
            if (field === "languages" ? !LANGUAGE_TAG.test(trimmed) : trimmed.length > MAX_KEYTERM_CHARS) throw invalid();
            terms.push(trimmed);
        }
    }
    if (field === "keyterms" && terms.length > MAX_KEYTERMS) throw invalid();
    return terms;
}

/** Build the `/v1/listen` query; parameter values are percent-encoded, never form-encoded. */
function listenQuery(settings: Settings, languages: string[], keyterms: string[]): string {
    const pairs: [string, string][] = [
        ["model", MODEL], ["encoding", "linear16"], ["sample_rate", String(SAMPLE_RATE)], ["channels", "1"],
        ["interim_results", "true"], ["endpointing", "false"],
    ];
    if (settings.smartFormat) pairs.push(["smart_format", "true"], ["no_delay", "true"]);
    pairs.push(["language", languages.length === 1 ? languages[0]! : "multi"]);
    if (languages.length > 1) for (const language of languages) pairs.push(["language_hint", language]);
    if (settings.mipOptOut) pairs.push(["mip_opt_out", "true"]);
    for (const term of keyterms) pairs.push(["keyterm", term]);
    return pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}

function failure(code: types.voice.ErrorCode, message?: string): StreamError {
    const fixed = code === "providerAuth" ? "Deepgram rejected the connection credentials."
        : code === "timeout" ? "Deepgram recognition timed out."
        : code === "backpressure" ? "Deepgram audio could not be sent fast enough."
        : "Deepgram transcription failed.";
    return Object.assign(new Error(message ?? fixed), { code });
}

/** Attach a closed-set diagnostic reason and a safe machine detail; core validates both again before storage. */
function classified(error: StreamError, reason: string, detail?: string | number, cause?: "authentication" | "rateLimit" | "unknown"): StreamError {
    return Object.assign(error, { diagnosticReason: reason, ...(detail !== undefined ? { diagnosticDetail: String(detail) } : {}), ...(cause ? { diagnosticCause: cause } : {}) });
}

function isHeaderValue(value: unknown, max: number): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= max && !/[^\x21-\x7e]/.test(value);
}

function phraseText(commit: Commit): string {
    return [...commit.finals, commit.interim].filter(Boolean).join(" ");
}

async function openListen(conn: types.voice.ResolvedConnection, session: types.voice.StreamSession, check: boolean): Promise<types.voice.VoiceStream> {
    let settings: Settings;
    let languages: string[];
    let keyterms: string[];
    try { settings = connectionSettings(conn.config); } catch (error) {
        throw failure("routeUnavailable", error instanceof InvalidField ? error.message : "Deepgram configuration is invalid.");
    }
    try {
        // Chat-level options replace the connection's lists; core already narrowed them to the model.
        languages = session.options.languages !== undefined ? termList("languages", session.options.languages, false) : settings.languages ?? [];
        keyterms = session.options.keywords !== undefined ? termList("keyterms", session.options.keywords, false) : settings.keyterms ?? [];
    } catch (error) {
        throw failure("protocol", error instanceof InvalidField ? error.message : "Deepgram recognition options are invalid.");
    }
    if (session.sampleRate !== SAMPLE_RATE) throw failure("protocol", "Deepgram requires PCM at 16 kHz.");
    const url = new URL(settings.url.href);
    url.search = `?${listenQuery(settings, languages, keyterms)}`;

    const signal = conn.signal && conn.signal !== session.signal ? AbortSignal.any([conn.signal, session.signal]) : session.signal;
    if (signal.aborted) throw failure("provider");
    const ready = Promise.withResolvers<void>();
    let socket: types.voice.BoundWebSocket | undefined;
    let accepted = false;
    let closed = false;
    let closing = false; // CloseStream was sent; the service's close now completes the stream.
    let terminalError: StreamError | undefined;
    let finish: ReturnType<typeof Promise.withResolvers<void>> | undefined;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    let lastSend = Date.now();
    let usageReported = false;
    // Audio accounting: whole samples only, re-framed into 50 ms frames.
    let carry: number | undefined;
    let remainder: Buffer = Buffer.alloc(0);
    let sentBytes = 0;
    let bytesSinceCommit = 0;
    let lastCommitEnd = 0;
    // Pending commits in commit order; the head settles first.
    const pending: Commit[] = [];
    // Text for audio after the last commit; the next commit takes it over.
    let openSegments: Segment[] = [];
    let openInterim = "";

    const cleanup = (error?: StreamError, notify = true): void => {
        if (closed) return;
        closed = true;
        terminalError = error;
        signal.removeEventListener("abort", abort);
        clearTimeout(openTimer);
        clearTimeout(finishTimer);
        clearTimeout(closeTimer);
        clearInterval(keepAlive);
        for (const commit of pending) clearTimeout(commit.timer);
        pending.length = 0;
        openSegments = [];
        remainder = Buffer.alloc(0);
        const ws = socket;
        socket = undefined;
        if (ws) {
            ws.removeEventListener("open", onOpen);
            ws.removeEventListener("message", onMessage);
            ws.removeEventListener("error", onError);
            ws.removeEventListener("close", onClose);
            if (ws.readyState !== SOCKET_CLOSED) {
                if (error) { try { ws.terminate(); } catch { /* It may already be closing. */ } }
                else {
                    // Bound the close handshake too: a peer that ignores our close cannot retain the socket.
                    const terminate = () => { if (ws.readyState !== SOCKET_CLOSED) { try { ws.terminate(); } catch { /* gone */ } } };
                    const timer = setTimeout(terminate, 250);
                    ws.addEventListener("close", () => clearTimeout(timer), { once: true });
                    try { ws.close(1000); } catch { clearTimeout(timer); terminate(); }
                }
            }
        }
        if (error) {
            if (!accepted) ready.reject(error);
            finish?.reject(error);
            if (accepted && notify) session.fail(error);
        } else finish?.resolve();
    };
    const abort = () => cleanup(failure("provider"), false);
    const openTimer = setTimeout(() => cleanup(classified(failure("timeout", "Deepgram session setup timed out."), "setupTimeout")), OPEN_TIMEOUT_MS);

    function send(data: string | Uint8Array): void {
        let code: types.voice.ErrorCode = "provider";
        try {
            if (socket?.readyState === SOCKET_OPEN) {
                const size = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
                if (socket.bufferedAmount + size > MAX_BUFFER_BYTES) code = "backpressure";
                else { socket.send(data); lastSend = Date.now(); return; }
            }
        } catch { /* Only report the local failure, never a transport exception. */ }
        const error = classified(failure(code), "sendFailed");
        cleanup(error);
        throw error;
    }

    /** Send the shorter tail before a control message; never an empty binary frame (that closes the stream). */
    function flushRemainder(): void {
        if (!remainder.byteLength) return;
        const tail = remainder;
        remainder = Buffer.alloc(0);
        send(tail);
    }

    function onOpen(): void {
        if (closed || accepted) return;
        // No session handshake on /v1/listen: a successful upgrade means the stream is ready.
        clearTimeout(openTimer);
        accepted = true;
        lastSend = Date.now();
        keepAlive = setInterval(() => {
            if (closed || closing || Date.now() - lastSend < KEEPALIVE_MS) return;
            try { send(JSON.stringify({ type: "KeepAlive" })); } catch { /* send has already failed the session safely. */ }
        }, KEEPALIVE_CHECK_MS);
        ready.resolve();
    }

    function onError(event: Event): void {
        // Failed upgrades expose the HTTP status only in this fixed diagnostic format; classify the status without
        // ever forwarding the diagnostic, URL or response body.
        const message = (event as ErrorEvent).message;
        const status = !accepted && typeof message === "string" ? /Expected 101 status code: ([1-5][0-9]{2})$/.exec(message)?.[1] : undefined;
        const auth = status === "401" || status === "403";
        const limited = status === "429";
        cleanup(classified(failure(auth ? "providerAuth" : "provider"), "socketError", status ? `http_${status}` : undefined, auth ? "authentication" : limited ? "rateLimit" : "unknown"));
    }

    function onClose(event: Event): void {
        // Only the numeric close code is kept; the close reason is peer-controlled free text and is never read.
        const code = (event as CloseEvent).code;
        if (closing && (code === 1000 || code === 1005)) { cleanup(); return; }
        cleanup(classified(failure("provider"), "socketClosed", Number.isInteger(code) && code >= 1000 && code <= 4999 ? code : undefined));
    }

    function emitRevision(commit: Commit): void {
        const text = phraseText(commit);
        if (closed || commit.done || text === commit.shown) return;
        commit.shown = text;
        session.emit({ type: "revision", order: commit.order, text });
    }

    function armQuiet(commit: Commit): void {
        clearTimeout(commit.timer);
        commit.timer = setTimeout(() => {
            commit.done = true;
            settle();
        }, QUIET_MS);
    }

    /** Emit finals strictly in commit order, then complete a finishing stream once nothing is pending. */
    function settle(): void {
        while (!closed && pending[0]?.done) {
            const commit = pending.shift()!;
            clearTimeout(commit.timer);
            session.emit({ type: "final", order: commit.order, text: commit.finals.join(" ") });
        }
        if (!closed && finish && !closing && !pending.length) closeStream();
    }

    function closeStream(): void {
        closing = true;
        try {
            flushRemainder();
            send(JSON.stringify({ type: "CloseStream" }));
        } catch { return; }
        closeTimer = setTimeout(() => {
            // A connection check must prove the stream closes; a live session has already delivered every phrase.
            if (check) cleanup(classified(failure("timeout"), "finishTimeout"));
            else cleanup();
        }, CLOSE_WAIT_MS);
    }

    function onMessage(incoming: Event): void {
        const event = incoming as MessageEvent;
        if (closed) return;
        let message: Record<string, unknown>;
        try {
            if (typeof event.data !== "string" || Buffer.byteLength(event.data) > MAX_BUFFER_BYTES) throw failure("provider");
            const parsed: unknown = JSON.parse(event.data);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as { type?: unknown }).type !== "string") throw failure("provider");
            message = parsed as Record<string, unknown>;
        } catch { cleanup(classified(failure("provider"), "malformedMessage")); return; }
        if (message.type === "Error") { cleanup(classified(failure("provider"), "serviceError")); return; }
        if (message.type === "Metadata") {
            const duration = message.duration;
            if (!usageReported && typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
                usageReported = true;
                session.emit({ type: "usage", audioSeconds: duration });
            }
            return;
        }
        if (message.type !== "Results") return; // SpeechStarted, UtteranceEnd and future types carry no text.
        const alternative = (message.channel as { alternatives?: { transcript?: unknown }[] } | undefined)?.alternatives?.[0];
        const { start, duration } = message;
        const text = alternative?.transcript;
        if (typeof text !== "string" || typeof start !== "number" || typeof duration !== "number" ||
            !Number.isFinite(start) || !Number.isFinite(duration) || start < 0 || duration < 0) {
            cleanup(classified(failure("provider"), "malformedMessage"));
            return;
        }
        result(text.trim(), start, start + duration, message.is_final === true, message.from_finalize === true);
    }

    /** Attribute one result to a commit by audio time, or to the open phrase after the last commit. */
    function result(text: string, start: number, end: number, isFinal: boolean, fromFinalize: boolean): void {
        const index = pending.findIndex(commit => !commit.empty && commit.endSec > start + TOLERANCE_SEC);
        if (index < 0) {
            // Audio before the last commit belongs to a settled phrase: a late segment cannot change it.
            if (start + TOLERANCE_SEC < lastCommitEnd) return;
            if (isFinal) {
                if (text) {
                    if (openSegments.length >= MAX_OPEN_SEGMENTS) { cleanup(classified(failure("provider"), "sequenceMismatch")); return; }
                    openSegments.push({ start, text });
                }
                openInterim = "";
            } else openInterim = text;
            return;
        }
        const commit = pending[index]!;
        if (commit.done) return;
        armQuiet(commit);
        if (isFinal) {
            if (text) commit.finals.push(text);
            commit.interim = "";
        } else commit.interim = text;
        if (isFinal && (fromFinalize || end >= commit.endSec - TOLERANCE_SEC)) {
            // This commit's Finalize was answered or its audio is covered; settle() still keeps commit order,
            // so an earlier commit waits for its own answer or quiet timer. The final carries the text.
            commit.done = true;
            settle();
            return;
        }
        emitRevision(commit);
    }

    signal.addEventListener("abort", abort, { once: true });
    void (async () => {
        try {
            const key = await conn.secret("apiKey");
            if (closed) return;
            if (!isHeaderValue(key, 16_384)) { cleanup(failure("providerAuth")); return; }
            // One connection-bound path for checks and live sessions: the saved route carries the upgrade and frames.
            const ws = conn.openWebSocket(url.href, { headers: { Authorization: `Token ${key}` } });
            socket = ws;
            ws.addEventListener("open", onOpen);
            ws.addEventListener("message", onMessage);
            ws.addEventListener("error", onError);
            ws.addEventListener("close", onClose);
        } catch { cleanup(failure("provider")); }
    })();
    await ready.promise;
    if (closed) throw terminalError ?? failure("provider");

    function requireListening(): void {
        if (closed || finish) throw terminalError ?? failure("provider");
    }

    return {
        async append(pcm) {
            requireListening();
            if (!pcm.byteLength) return;
            if (pcm.byteLength > MAX_BUFFER_BYTES) throw failure("backpressure");
            // Carry an odd trailing byte so every frame holds whole PCM16 samples.
            let audio = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
            if (carry !== undefined) audio = Buffer.concat([Buffer.of(carry), audio]);
            carry = audio.byteLength % 2 ? audio[audio.byteLength - 1] : undefined;
            if (carry !== undefined) audio = audio.subarray(0, audio.byteLength - 1);
            if (!audio.byteLength) return;
            sentBytes += audio.byteLength;
            bytesSinceCommit += audio.byteLength;
            let buffered = remainder.byteLength ? Buffer.concat([remainder, audio]) : Buffer.from(audio);
            while (buffered.byteLength >= FRAME_BYTES) {
                send(buffered.subarray(0, FRAME_BYTES));
                buffered = buffered.subarray(FRAME_BYTES);
            }
            remainder = buffered;
        },
        async commit(order) {
            requireListening();
            const commit: Commit = { order, endSec: sentBytes / BYTES_PER_SECOND, empty: bytesSinceCommit === 0, finals: [], interim: "", done: false, shown: "" };
            if (commit.empty) {
                // Nothing to finalize upstream: settle the empty phrase locally, after earlier phrases.
                commit.done = true;
                pending.push(commit);
                settle();
                return;
            }
            bytesSinceCommit = 0;
            lastCommitEnd = commit.endSec;
            // Text that arrived for this audio before the commit belongs to it.
            commit.finals = openSegments.map(segment => segment.text);
            commit.interim = openInterim;
            openSegments = [];
            openInterim = "";
            pending.push(commit);
            flushRemainder();
            send(JSON.stringify({ type: "Finalize" }));
            armQuiet(commit);
            emitRevision(commit);
        },
        async finish() {
            if (!finish) {
                if (terminalError) throw terminalError;
                finish = Promise.withResolvers<void>();
                finishTimer = setTimeout(() => cleanup(classified(failure("timeout", "Deepgram did not finish transcribing in time."), "finishTimeout")), FINISH_TIMEOUT_MS);
                settle();
            }
            return finish.promise;
        },
        async cancel() { abort(); },
    };
}
