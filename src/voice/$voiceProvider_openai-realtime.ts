const MODEL = "gpt-live-transcribe";
const SAMPLE_RATE = 24_000;
const BASE_URL = "https://api.openai.com/v1";
const DEFAULT_HOST = new URL(BASE_URL).host;
const DELAYS = ["minimal", "low", "medium", "high", "xhigh"] as const;
const OPEN_TIMEOUT_MS = 5_000;
const FINISH_TIMEOUT_MS = 10_000;
const MAX_BUFFER_BYTES = 1024 * 1024;
// The service rejects commits under 100 ms of audio (4800 bytes of PCM16 at 24 kHz) with input_audio_buffer_commit_empty.
const MIN_COMMIT_BYTES = SAMPLE_RATE / 10 * 2;
// gpt-live-transcribe streams deltas before the commit acknowledgement names their item; hold them, bounded.
const MAX_EARLY_ITEMS = 8;
const MAX_EARLY_BYTES = MAX_BUFFER_BYTES;
const MAX_RECENT_ITEMS = 128;
// Service errors that end the session even when they name a pending commit.
const TERMINAL_ERRORS = ["rate_limit_exceeded", "rate_limit_error", "server_error", "session_expired"];
const SOCKET_OPEN = 1;
const SOCKET_CLOSED = 3;
const MAX_OPTION_CHARS = 4000;
const INVALID_KEYWORD = /[<>\r\n\v\f\u0085\u2028\u2029]/;
const AUTH_ERRORS = [
    "invalid_api_key", "missing_api_key", "authentication_error", "invalid_authentication",
    "permission_error", "insufficient_permissions", "unauthorized",
];

type Config = Readonly<Record<string, types.voice.ConfigValue>>;
type ConfigIssue = NonNullable<ReturnType<NonNullable<types.voice.ProviderDefinition["validateConfig"]>>>;
type StreamError = Error & { code: types.voice.ErrorCode };
type Item = { order: number; text: string };
type Pending = { order: number; eventId: string };

const provider: types.voice.ProviderDefinition = {
    id: "openai-realtime",
    label: "OpenAI Realtime transcription",
    description: "Streams audio from the MauzCode server to the configured OpenAI Realtime service.",
    destination: { kind: "cloud", label: "OpenAI Realtime (api.openai.com or the host of the configured Base URL)" },
    // The disclosure of one stored connection: host and port of the endpoint it actually uses, nothing else.
    destinationFor(config) {
        let url: URL;
        try { url = connectionSettings(config).url; } catch { return undefined; }
        return url.host === DEFAULT_HOST
            ? { kind: "cloud", label: `OpenAI Realtime (${url.host})` }
            : { kind: "cloud", label: `Configured endpoint (${url.host})` };
    },
    // Every upstream socket (check and live session) is opened through conn.openWebSocket, so all routes work.
    transports: ["direct", "socks", "ssh-tunnel"],
    fields: [
        { key: "apiKey", label: "API key", type: "secret", required: true },
        { key: "baseUrl", label: "Base URL", type: "url", default: BASE_URL, help: "HTTPS API base URL, without a query or fragment." },
        { key: "organization", label: "Organization", type: "text" },
        { key: "project", label: "Project", type: "text" },
        { key: "languages", label: "Languages", type: "text", help: "Comma-separated language codes, for example en, ru, zh-Hans." },
        { key: "keywords", label: "Keywords", type: "text", help: "Comma-separated terms on one line, with no angle brackets." },
        { key: "prompt", label: "Transcription prompt", type: "text" },
        { key: "delay", label: "Transcription delay", type: "select", options: DELAYS.map(value => ({ value, label: value })) },
    ],
    models: [{
        id: MODEL,
        label: "GPT Live Transcribe",
        description: "Live transcription, metered per audio minute.",
        capabilities: { turnDetection: "client", sampleRates: [SAMPLE_RATE], languages: true, keywords: true, prompt: true, delay: true },
    }],
    validateConfig(config) {
        try { connectionSettings(config); } catch (error) {
            if (error instanceof InvalidField) return { field: error.field, reason: error.reason };
            throw error;
        }
    },
    async test(_ctx, conn) {
        try {
            const stream = await openRealtime(conn, {
                sampleRate: SAMPLE_RATE, options: {}, signal: conn.signal ?? new AbortController().signal,
                emit: () => {}, fail: () => {},
            });
            await stream.finish();
            return { status: "available", reason: "voice-ok", message: "Voice connection is ready", checkedAt: Date.now() };
        } catch (error) {
            const code = (error as StreamError).code;
            const reason = code === "providerAuth" ? "bad-key" : code === "timeout" ? "timeout" : "unreachable";
            return { status: "unavailable", reason, message: "Voice connection check failed", checkedAt: Date.now() };
        }
    },
    open: (_ctx, conn, session) => openRealtime(conn, session),
};

export default provider;

class InvalidField extends Error implements ConfigIssue {
    constructor(readonly field: string, message: string, readonly reason?: ConfigIssue["reason"]) { super(message); }
}

function connectionSettings(config: Config) {
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
    url.pathname = `${url.pathname.replace(/\/+$/, "") || "/v1"}/realtime`;
    url.search = "?intent=transcription";

    const headers: Record<string, string> = {};
    for (const [field, header] of [["organization", "OpenAI-Organization"], ["project", "OpenAI-Project"]] as const) {
        const value = config[field];
        if (value === undefined) continue;
        if (!isHeaderValue(value, MAX_OPTION_CHARS)) throw new InvalidField(field, `${header} must be a single identifier with no whitespace.`, "headerIdentifier");
        headers[header] = value;
    }
    return { url, headers, options: recognitionSettings(config, true) };
}

function isHeaderValue(value: unknown, max: number): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= max && !/[^\x21-\x7e]/.test(value);
}

function recognitionSettings(input: Readonly<Record<string, unknown>>, commaSeparated: boolean): types.voice.RecognitionOptions {
    const options: types.voice.RecognitionOptions = {};
    for (const field of ["languages", "keywords"] as const) {
        const value = input[field];
        if (value === undefined) continue;
        const list: unknown = commaSeparated && typeof value === "string" && value.length <= MAX_OPTION_CHARS ? value.split(",") : value;
        const invalid = () => field === "keywords"
            ? new InvalidField(field, "Keywords must be single-line terms without angle brackets.", "keywordList")
            : new InvalidField(field, "Languages must be two- or three-letter codes or zh-* language tags.", "languageList");
        if (!Array.isArray(list) || list.length > MAX_OPTION_CHARS) throw invalid();
        let length = 0;
        const terms: string[] = [];
        for (const term of list) {
            if (typeof term !== "string" || (length += term.length + 1) > MAX_OPTION_CHARS ||
                (field === "keywords" && INVALID_KEYWORD.test(term))) throw invalid();
            const trimmed = term.trim();
            if (!trimmed) continue;
            if (field === "languages" && !/^(?:[a-z]{2,3}|zh(?:-[a-z0-9]{2,8})+)$/i.test(trimmed)) throw invalid();
            terms.push(trimmed);
        }
        // Keep an explicit empty override until the connection and per-chat settings have been merged.
        options[field] = terms;
    }
    const { prompt, delay } = input;
    if (prompt !== undefined) {
        if (typeof prompt !== "string" || prompt.length > MAX_OPTION_CHARS) throw new InvalidField("prompt", "Transcription prompt must be text up to 4000 characters.");
        options.prompt = prompt;
    }
    if (delay !== undefined) {
        if (!DELAYS.includes(delay as typeof DELAYS[number])) throw new InvalidField("delay", "Transcription delay must be minimal, low, medium, high or xhigh.");
        options.delay = delay as typeof DELAYS[number];
    }
    return options;
}

function failure(code: types.voice.ErrorCode, message?: string): StreamError {
    const fixed = code === "providerAuth" ? "OpenAI Realtime rejected the connection credentials."
        : code === "timeout" ? "OpenAI Realtime recognition timed out."
        : code === "backpressure" ? "OpenAI Realtime audio could not be sent fast enough."
        : "OpenAI Realtime transcription failed.";
    return Object.assign(new Error(message ?? fixed), { code });
}

/** Attach a closed-set diagnostic reason and a safe machine detail; core validates both again before storage. */
function classified(error: StreamError, reason: string, detail?: string | number, cause?: "authentication" | "rateLimit" | "unknown"): StreamError {
    return Object.assign(error, { diagnosticReason: reason, ...(detail !== undefined ? { diagnosticDetail: String(detail) } : {}), ...(cause ? { diagnosticCause: cause } : {}) });
}

/** Keep only a lowercase service identifier; anything else (free text, odd casing, long values) is dropped. */
function serviceId(value: unknown): string | undefined {
    return typeof value === "string" && /^[a-z][a-z0-9_.]{0,63}$/.test(value) ? value : undefined;
}

async function openRealtime(conn: types.voice.ResolvedConnection, session: types.voice.StreamSession): Promise<types.voice.VoiceStream> {
    let settings: ReturnType<typeof connectionSettings>;
    let options: types.voice.RecognitionOptions;
    try { settings = connectionSettings(conn.config); } catch (error) {
        throw failure("routeUnavailable", error instanceof InvalidField ? error.message : "OpenAI Realtime configuration is invalid.");
    }
    try { options = { ...settings.options, ...recognitionSettings(session.options, false) }; } catch (error) {
        throw failure("protocol", error instanceof InvalidField ? error.message : "OpenAI Realtime recognition options are invalid.");
    }
    if (session.sampleRate !== SAMPLE_RATE) throw failure("protocol", "OpenAI Realtime requires PCM at 24 kHz.");
    const { languages, keywords, prompt, delay } = options;
    const update = {
        type: "session.update",
        session: {
            type: "transcription",
            audio: { input: {
                format: { type: "audio/pcm", rate: SAMPLE_RATE },
                noise_reduction: { type: "near_field" },
                transcription: {
                    model: MODEL,
                    ...(languages?.length ? { languages } : {}),
                    ...(keywords?.length ? { keywords } : {}),
                    ...(prompt?.trim() ? { prompt } : {}),
                    ...(delay !== undefined ? { delay } : {}),
                },
                turn_detection: null,
            } },
        },
    };

    const signal = conn.signal && conn.signal !== session.signal ? AbortSignal.any([conn.signal, session.signal]) : session.signal;
    if (signal.aborted) throw failure("provider");
    const ready = Promise.withResolvers<void>();
    let socket: types.voice.BoundWebSocket | undefined;
    let setupSent = false;
    let accepted = false;
    let closed = false;
    let terminalError: StreamError | undefined;
    let finish: ReturnType<typeof Promise.withResolvers<void>> | undefined;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    // Commits awaiting their acknowledgement, FIFO; each carries the event_id an error event can name.
    const pending: Pending[] = [];
    const items = new Map<string, Item>();
    const recent = new Set<string>(); // Bounded tombstones only; never retain settled transcripts.
    // Transcription events for items not acknowledged yet, in arrival order, bounded by item count and bytes.
    const early = new Map<string, { message: Record<string, unknown>; bytes: number }[]>();
    let earlyBytes = 0;
    let unsettled = 0;
    let eventSeq = 0;
    let bytesSinceCommit = 0;
    let carry: number | undefined;
    const nextEventId = () => `mc_${eventSeq++}`;

    const cleanup = (error?: StreamError, notify = true): void => {
        if (closed) return;
        closed = true;
        terminalError = error;
        signal.removeEventListener("abort", abort);
        clearTimeout(openTimer);
        clearTimeout(finishTimer);
        pending.length = 0;
        items.clear();
        recent.clear();
        early.clear();
        earlyBytes = 0;
        const ws = socket;
        socket = undefined;
        if (ws) {
            ws.removeEventListener("open", onOpen);
            ws.removeEventListener("message", onMessage);
            ws.removeEventListener("error", onError);
            ws.removeEventListener("close", onClose);
            const terminate = () => {
                if (ws.readyState !== SOCKET_CLOSED) {
                    try { ws.terminate(); } catch { /* It may already be closing. */ }
                }
            };
            if (error) terminate();
            else if (ws.readyState !== SOCKET_CLOSED) {
                // Bound the close handshake too: a peer that ignores our close cannot retain the socket.
                const closeTimer = setTimeout(terminate, 250);
                ws.addEventListener("close", () => clearTimeout(closeTimer), { once: true });
                try { ws.close(1000); } catch { clearTimeout(closeTimer); terminate(); }
            }
        }
        if (error) {
            if (!accepted) ready.reject(error);
            finish?.reject(error);
            if (accepted && notify) session.fail(error);
        } else finish?.resolve();
    };
    const abort = () => cleanup(failure("provider"), false);
    const openTimer = setTimeout(() => cleanup(classified(failure("timeout", "OpenAI Realtime session setup timed out."), "setupTimeout")), OPEN_TIMEOUT_MS);

    function send(message: object): void {
        let code: types.voice.ErrorCode = "provider";
        try {
            if (socket?.readyState === SOCKET_OPEN) {
                const body = JSON.stringify(message);
                if (socket.bufferedAmount + Buffer.byteLength(body) > MAX_BUFFER_BYTES) code = "backpressure";
                else { socket.send(body); return; }
            }
        } catch { /* Only report the local failure, never a transport exception. */ }
        const error = classified(failure(code), "sendFailed");
        cleanup(error);
        throw error;
    }

    function onOpen(): void {
        if (closed || setupSent) return;
        setupSent = true;
        try { send({ ...update, event_id: nextEventId() }); } catch { /* send has already failed the session safely. */ }
    }

    function onError(event: Event): void {
        // Bun won't follow WebSocket redirects. For failed upgrades it exposes HTTP status only in this fixed
        // diagnostic format; classify the status without ever forwarding the diagnostic, URL or response body.
        const message = (event as ErrorEvent).message;
        const status = !accepted && typeof message === "string" ? /failed: Expected 101 status code: ([1-5][0-9]{2})$/.exec(message)?.[1] : undefined;
        const auth = status === "401" || status === "403";
        const limited = status === "429";
        cleanup(classified(failure(auth ? "providerAuth" : "provider"), "socketError", status ? `http_${status}` : undefined, auth ? "authentication" : limited ? "rateLimit" : "unknown"));
    }

    function onClose(event: Event): void {
        // Only the numeric close code is kept; the close reason is peer-controlled free text and is never read.
        const code = (event as CloseEvent).code;
        cleanup(classified(failure("provider"), "socketClosed", Number.isInteger(code) && code >= 1000 && code <= 4999 ? code : undefined));
    }

    function maybeFinish(): void {
        if (finish && unsettled === 0) cleanup();
    }

    function onMessage(incoming: Event): void {
        const event = incoming as MessageEvent;
        if (closed) return;
        let message: Record<string, unknown>;
        try {
            if (typeof event.data !== "string" || Buffer.byteLength(event.data) > MAX_BUFFER_BYTES) throw failure("provider");
            const parsed: unknown = JSON.parse(event.data);
            if (!parsed || typeof parsed !== "object" || !("type" in parsed) || typeof parsed.type !== "string") throw failure("provider");
            message = parsed as Record<string, unknown>;
        } catch { cleanup(classified(failure("provider"), "malformedMessage")); return; }
        const { type, item_id: id } = message;
        if (type === "error") {
            const error = message.error as { code?: string; type?: string; event_id?: unknown } | undefined;
            const auth = AUTH_ERRORS.includes(error?.code ?? "") || AUTH_ERRORS.includes(error?.type ?? "");
            const limited = error?.code === "rate_limit_exceeded" || error?.type === "rate_limit_error";
            const terminal = auth || TERMINAL_ERRORS.includes(error?.code ?? "") || TERMINAL_ERRORS.includes(error?.type ?? "");
            // An error that names a pending commit (for example input_audio_buffer_commit_empty) fails only that
            // phrase: the service keeps the socket usable. Everything else, including setup errors, stays terminal.
            const index = accepted && !terminal && typeof error?.event_id === "string"
                ? pending.findIndex(entry => entry.eventId === error.event_id) : -1;
            if (index >= 0) {
                const [entry] = pending.splice(index, 1);
                unsettled--;
                session.emit({ type: "failed", order: entry!.order, message: "OpenAI Realtime could not transcribe this phrase." });
                maybeFinish();
                return;
            }
            cleanup(classified(failure(auth ? "providerAuth" : "provider"), "serviceError", serviceId(error?.code) ?? serviceId(error?.type), auth ? "authentication" : limited ? "rateLimit" : "unknown"));
            return;
        }
        if (!accepted) {
            if (type === "session.updated" && setupSent) {
                const updated = message.session as { type?: unknown } | undefined;
                if (updated?.type !== undefined && updated.type !== "transcription") { cleanup(classified(failure("provider"), "malformedMessage")); return; }
                clearTimeout(openTimer);
                accepted = true;
                ready.resolve();
            }
            return;
        }
        if (type === "input_audio_buffer.committed") {
            // The ack binds FIFO to the oldest pending commit. previous_item_id is optional and never decides anything.
            const entry = pending.shift();
            if (typeof id !== "string" || !id || items.has(id) || recent.has(id) || entry === undefined) { cleanup(classified(failure("provider"), "sequenceMismatch")); return; }
            items.set(id, { order: entry.order, text: "" });
            const queued = early.get(id);
            if (queued) {
                early.delete(id);
                for (const held of queued) {
                    earlyBytes -= held.bytes;
                    if (closed) return;
                    transcriptionEvent(held.message);
                }
            }
            // Unmatched traffic cannot belong to another live item once all sent audio
            // has an acknowledged commit. Drop it at the boundary, not at session close.
            if (!pending.length && !bytesSinceCommit) { early.clear(); earlyBytes = 0; }
            return;
        }
        if (!isTranscription(type)) return;
        if (typeof id !== "string" || !id) { cleanup(classified(failure("provider"), "malformedMessage")); return; }
        if (recent.has(id)) return;
        if (!items.has(id)) {
            if (!bytesSinceCommit && !pending.length) return; // No new upstream item can exist.
            // gpt-live-transcribe streams text before our commit is acknowledged: hold it until the ack binds the item.
            const bytes = Buffer.byteLength(event.data as string);
            const queued = early.get(id);
            if ((!queued && early.size >= MAX_EARLY_ITEMS) || earlyBytes + bytes > MAX_EARLY_BYTES) {
                cleanup(classified(failure("provider"), "sequenceMismatch"));
                return;
            }
            earlyBytes += bytes;
            if (queued) queued.push({ message, bytes });
            else early.set(id, [{ message, bytes }]);
            return;
        }
        transcriptionEvent(message);
    }

    function isTranscription(type: unknown): boolean {
        return type === "conversation.item.input_audio_transcription.delta" ||
            type === "conversation.item.input_audio_transcription.completed" ||
            type === "conversation.item.input_audio_transcription.failed";
    }

    /** Apply one delta, completed or failed event to an item that is already bound to its core order. */
    function transcriptionEvent(message: Record<string, unknown>): void {
        const item = items.get(message.item_id as string);
        if (!item) return; // Duplicate finals, failures and trailing deltas cannot change transcript or usage.
        if (message.type === "conversation.item.input_audio_transcription.delta") {
            if (typeof message.delta !== "string" || item.text.length + message.delta.length > MAX_BUFFER_BYTES) { cleanup(classified(failure("provider"), "malformedMessage")); return; }
            item.text += message.delta;
            session.emit({ type: "revision", order: item.order, text: item.text });
            return;
        }
        const failed = message.type === "conversation.item.input_audio_transcription.failed";
        if (!failed && typeof message.transcript !== "string") { cleanup(classified(failure("provider"), "malformedMessage")); return; }
        const id = message.item_id as string;
        items.delete(id);
        recent.add(id);
        if (recent.size > MAX_RECENT_ITEMS) recent.delete(recent.values().next().value!);
        unsettled--;
        if (failed) session.emit({ type: "failed", order: item.order, message: "OpenAI Realtime could not transcribe this phrase." });
        else {
            const usage = message.usage as { type?: unknown; seconds?: unknown } | undefined;
            const seconds = usage?.seconds;
            if (usage?.type === "duration" && typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
                session.emit({ type: "usage", audioSeconds: seconds });
            }
            if (!closed) session.emit({ type: "final", order: item.order, text: message.transcript as string });
        }
        maybeFinish();
    }

    signal.addEventListener("abort", abort, { once: true });
    void (async () => {
        try {
            const key = await conn.secret("apiKey");
            if (closed) return;
            if (!isHeaderValue(key, 16_384)) { cleanup(failure("providerAuth")); return; }
            // One connection-bound path for checks and live sessions: the saved route carries the upgrade and frames.
            const ws = conn.openWebSocket(settings.url.href, { headers: { ...settings.headers, Authorization: `Bearer ${key}` } });
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
            // The service rejects audio that is not whole PCM16 samples: carry an odd trailing byte to the next append.
            let audio = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
            if (carry !== undefined) audio = Buffer.concat([Buffer.of(carry), audio]);
            carry = audio.byteLength % 2 ? audio[audio.byteLength - 1] : undefined;
            if (carry !== undefined) audio = audio.subarray(0, audio.byteLength - 1);
            if (!audio.byteLength) return;
            send({ type: "input_audio_buffer.append", audio: audio.toString("base64") });
            bytesSinceCommit += audio.byteLength;
        },
        async commit(order) {
            requireListening();
            if (bytesSinceCommit === 0) {
                // The service would answer input_audio_buffer_commit_empty: settle the empty phrase locally.
                session.emit({ type: "final", order, text: "" });
                return;
            }
            if (bytesSinceCommit < MIN_COMMIT_BYTES) {
                // Pad a short tail with silence up to the service's 100 ms commit minimum.
                send({ type: "input_audio_buffer.append", audio: Buffer.alloc(MIN_COMMIT_BYTES - bytesSinceCommit).toString("base64") });
            }
            const eventId = nextEventId();
            pending.push({ order, eventId });
            unsettled++;
            bytesSinceCommit = 0;
            send({ type: "input_audio_buffer.commit", event_id: eventId });
        },
        async finish() {
            if (!finish) {
                if (terminalError) throw terminalError;
                finish = Promise.withResolvers<void>();
                finishTimer = setTimeout(() => cleanup(classified(failure("timeout", "OpenAI Realtime did not finish transcribing in time."), "finishTimeout")), FINISH_TIMEOUT_MS);
                maybeFinish();
            }
            return finish.promise;
        },
        async cancel() { abort(); },
    };
}
