import type { ServerWebSocket } from "bun";

const PATH = "/voice/session";
const CONTROL_BYTES = 1024;
const FRAME_BYTES = 16 * 1024;
const HEADER_BYTES = 4;
const BUFFER_BYTES = 1024 * 1024;
const IDLE_MS = 30_000;
const SESSION_MS = 5 * 60_000;
const FINISH_MS = 10_000;
const ACCESS_POLL_MS = 1_000;
const ACCESS_TIMEOUT_MS = 5_000;

type Socket = ServerWebSocket<{ state: { ownerId: string; relay?: ReturnType<typeof createRelay> } }>;
type Code = types.voice.ErrorCode;
type Timer = ReturnType<typeof setTimeout>;
type Phase = "awaiting" | "starting" | "listening" | "finishing" | "closed";
type Mode = "panel" | "inline";
type Settled = { type: "settled"; id: number; ok: boolean; throughOrder: number; code?: Code };
type Ready = { type: "ready"; mode: Mode; settle?: true; sessionId: string; route: string; destination: types.voice.Destination; sampleRate: number };

/**
 * Relay voice dictation in one owned editable chat. Start binds a fresh socket to one chat/generation;
 * finish drains it, and cancel closes it silently. Binary messages start with a zero-based uint32 LE
 * sequence followed by 20–100 ms of mono PCM16 LE at the rate in `ready`.
 */
export default {
    async upgrade(ctx, session, { req }) {
        const denied = (status: number) => Response.json({ type: "error", code: "unauthorized", message: "Voice access was refused." }, {
            status, headers: { "cache-control": "no-store" },
        });
        try {
            const user = session?.user as types.auth.User | undefined;
            if (!user?.id) return denied(401);
            if (user.role !== "owner" || user.disabledAt != null) return denied(403);
            const origin = req.headers.get("origin");
            if (req.method !== "GET" || new URL(req.url).pathname !== PATH || !origin ||
                new URL(origin).origin !== origin || origin !== await ctx.fns.http.publicOrigin({ req })) return denied(403);
            return { ownerId: user.id };
        } catch {
            return denied(403);
        }
    },
    open(ctx, _session, { ws }: { ws: Socket }) {
        ws.data.state.relay = createRelay(ctx, ws);
    },
    message(_ctx, _session, { ws, message }: { ws: Socket; message: string | Buffer }) {
        ws.data.state.relay?.receive(message);
    },
    close(_ctx, _session, { ws }: { ws: Socket }) {
        ws.data.state.relay?.disconnect();
    },
} satisfies types.procs.http.WsEndpoint;

function createRelay(ctx: Context, ws: Socket) {
    const { ownerId } = ws.data.state;
    const controller = new AbortController();
    let phase: Phase = "awaiting";
    const closed = () => phase === "closed";
    let session: types.voice.VoiceSession | undefined;
    let agentId = "";
    let mode: Mode = "inline";
    let panelClaimed = false;
    let lastBoundary = 0;
    let boundary: { id: number; before: number; started: boolean; result?: Settled } | undefined;
    let boundaryTimer: Timer | undefined;
    let unregister: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let idle: Timer | undefined;
    let duration: Timer | undefined;
    let finishTimer: Timer | undefined;
    let accessPoll: ReturnType<typeof setInterval> | undefined;
    let accessDeadline: Timer | undefined;
    let deadline = Infinity;
    let checking = false;
    let recheck = false;
    let sequence = 0;
    let minPcmBytes = 0;
    let maxPcmBytes = 0;
    let finishStarted = false;
    let reachedLimit = false;
    let pendingCompletion = false;
    const audio: Uint8Array[] = [];
    const replies: string[] = [];
    let audioBytes = 0;
    let replyBytes = 0;

    function stop(code?: Code, detail?: string, disconnect = false, reference?: unknown) {
        if (closed()) return;
        phase = "closed";
        clearTimeout(idle);
        clearTimeout(duration);
        clearTimeout(finishTimer);
        clearTimeout(accessDeadline);
        clearInterval(accessPoll);
        clearTimeout(boundaryTimer);
        boundary = undefined;
        unregister?.();
        unsubscribe?.();
        audio.length = replies.length = 0;
        session = undefined;
        delete ws.data.state.relay;
        controller.abort();
        if (disconnect) return;
        try {
            const errorId = typeof reference === "string" && /^[0-9a-f]{16}$/.test(reference) ? reference : undefined;
            if (code) ws.send(JSON.stringify({ type: "error", code, message: detail ?? ctx.fns.voice.session.message({ code }), errorId, claimed: panelClaimed || undefined }));
            ws.close(code ? (code === "backpressure" ? 1013 : 1008) : 1000);
        } catch { /* The peer may have disconnected; resources were already released. */ }
    }

    function send(message: string): boolean {
        try {
            if (ws.getBufferedAmount() + Buffer.byteLength(message) > BUFFER_BYTES) stop("backpressure");
            else if (ws.send(message) !== 0) return true;
            else stop(undefined, undefined, true);
        } catch { stop(undefined, undefined, true); }
        return false;
    }

    function forward(event: Ready | types.voice.SessionEvent) {
        // Check length before encoding potentially large provider text. Never log a serialized event.
        if (event.type === "phrase" && event.text.length > BUFFER_BYTES) return stop("backpressure");
        const message = JSON.stringify(event);
        if (checking) {
            replyBytes += Buffer.byteLength(message);
            if (replyBytes > BUFFER_BYTES || replies.length >= 1024) return stop("backpressure");
            replies.push(message);
        } else send(message);
    }

    async function access(): Promise<"edit" | "readOnly" | "unauthorized"> {
        // Do not use the cached agent or creator fallback: both owner role and chat ownership can change.
        const rows = await ctx.fns.procs.db.select({
            sql: `SELECT a.archived_at FROM agents a JOIN users u ON u.id = a.created_by
                  WHERE a.id = ? AND u.id = ? AND u.role = 'owner' AND u.disabled_at IS NULL`,
            params: [agentId, ownerId],
        });
        return !rows[0] ? "unauthorized" : rows[0].archived_at == null ? "edit" : "readOnly";
    }

    function checkAccess(invalidated = false) {
        if (closed()) return;
        if (checking) { recheck ||= invalidated; return; }
        checking = true;
        accessDeadline = setTimeout(() => stop("readOnly"), ACCESS_TIMEOUT_MS);
        void access().then(result => {
            if (closed()) return;
            clearTimeout(accessDeadline);
            checking = false;
            if (result !== "edit") return stop("readOnly");
            if (recheck) {
                recheck = false;
                checkAccess();
                return;
            }
            // Do not let transcripts or additional audio cross an invalidation while its check is pending.
            for (const reply of replies) if (!send(reply)) return;
            replies.length = replyBytes = 0;
            if (pendingCompletion) return complete();
            if (phase === "listening" && performance.now() >= deadline) beginFinish(true);
            if (checking || closed()) return;
            // The boundary belongs between the frames already queued when requested and later silence.
            for (const pcm of audio) {
                if (closed()) return;
                if (boundary && !boundary.started && boundary.before === 0) runBoundary(boundary);
                append(pcm);
                if (boundary && !boundary.started) boundary.before--;
            }
            audio.length = 0;
            if (boundary && !boundary.started) runBoundary(boundary);
            if (boundary?.result) {
                if (phase !== "finishing" && !send(JSON.stringify(boundary.result))) return;
                clearTimeout(boundaryTimer);
                boundary = undefined;
            }
            if (phase === "finishing" && !boundary) finish();
        }).catch(() => stop("readOnly"));
    }

    function append(pcm: Uint8Array) {
        void session!.append(pcm).catch(() => stop("provider")).finally(() => { audioBytes -= pcm.byteLength; });
    }

    function complete() {
        if (reachedLimit) stop("timeout", "The five-minute voice session limit was reached.");
        else {
            if (send(JSON.stringify({ type: "completed" }))) stop();
        }
    }

    function onEvent(event: types.voice.SessionEvent) {
        if (closed()) return;
        if (event.type === "error") {
            stop(event.code, event.code === "timeout" && phase === "finishing" ? "Voice finalization timed out." : undefined, false, event.errorId);
        } else if (event.type === "completed") {
            checkAccess();
            pendingCompletion = true;
        } else {
            checkAccess();
            forward(event);
        }
    }

    function runBoundary(active: NonNullable<typeof boundary>) {
        active.started = true;
        const handle = session!;
        void handle.settle().then(result => {
            if (boundary !== active || closed()) return;
            if (result.code === "timeout") return stop("timeout", "Voice finalization timed out.");
            active.result = { type: "settled", id: active.id, ...result, throughOrder: handle.status().committed - 1 };
            // Access gate also drains buffered final events ahead of the acknowledgement.
            checkAccess(true);
        }).catch(() => stop("provider"));
    }

    function beginBoundary(id: unknown) {
        if (mode !== "panel" || phase !== "listening" || typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return stop("protocol");
        if (id <= lastBoundary) return; // Never repeat a boundary, including after its acknowledgement.
        if (boundary || id !== lastBoundary + 1) return stop("protocol");
        lastBoundary = id;
        boundary = { id, before: audio.length, started: false };
        boundaryTimer = setTimeout(() => stop("timeout", "Voice finalization timed out."), FINISH_MS);
        checkAccess(true);
    }

    function finish() {
        if (finishStarted || closed()) return;
        finishStarted = true;
        // The session now owns the provider deadline and can correlate its timeout before the relay closes.
        clearTimeout(finishTimer);
        void session!.finish().then(result => {
            if (!result.ok && !closed()) stop(result.code ?? "provider");
        }).catch(() => stop("provider"));
    }

    function beginFinish(atLimit: boolean) {
        if (phase !== "listening") return;
        phase = "finishing";
        reachedLimit = atLimit;
        // A terminal finish supersedes an unstarted cut, or waits for an already-running cut
        // without issuing a positive draft acknowledgement. Both deadlines remain bounded.
        if (!boundary?.started) {
            boundary = undefined;
            clearTimeout(boundaryTimer);
        }
        clearTimeout(idle);
        clearTimeout(duration);
        finishTimer = setTimeout(() => stop("timeout", "Voice finalization timed out."), FINISH_MS);
        checkAccess(true);
    }

    function touch(message: string) {
        clearTimeout(idle);
        idle = setTimeout(() => stop("timeout", message), IDLE_MS);
    }

    async function start(id: string, accepted: Mode) {
        mode = accepted;
        phase = "starting";
        agentId = id;
        touch("Opening the voice session timed out.");
        try {
            const voice = (ctx.state.voice ??= {});
            const order = voice.socketStartOrder = (voice.socketStartOrder ?? 0) + 1;
            const key = JSON.stringify([ownerId, agentId]);
            const leases = (voice.socketSessions ??= new Map());
            const panels = (voice.panelSessions ??= new Map());
            const candidates = (voice.socketCandidates ??= new Set());
            const lease = { ownerId, agentId, panel: mode === "panel", order, supersede: () => stop("superseded") };
            candidates.add(lease);
            unregister = () => {
                candidates.delete(lease);
                if (leases.get(key) === lease) leases.delete(key);
                if (panels.get(ownerId) === lease) panels.delete(ownerId);
            };
            const permission = await access();
            if (closed()) return;
            if (permission !== "edit") return stop(permission);
            const previous = leases.get(key);
            const previousPanel = lease.panel ? panels.get(ownerId) : undefined;
            if ((previous && previous.order > order) || (previousPanel && previousPanel.order > order)) return stop("superseded");
            candidates.delete(lease);
            leases.set(key, lease);
            if (lease.panel) { panels.set(ownerId, lease); panelClaimed = true; }
            previous?.supersede();
            if (previousPanel !== previous) previousPanel?.supersede();
            // Invalidate older pending claims even if this provider fails before their authorization resolves.
            for (const candidate of candidates) {
                if (candidate.order < order && candidate.ownerId === ownerId &&
                    (candidate.agentId === agentId || (candidate.panel && lease.panel))) candidate.supersede();
            }
            unsubscribe = ctx.fns.procs.events.subscribe({ topics: ["agents"], handler: event => {
                if (event.type === "agents.changed" && (!event.agentId || event.agentId === agentId)) checkAccess(true);
            } });
            accessPoll = setInterval(checkAccess, ACCESS_POLL_MS);
            // Subscribe before the check so an archive during route/provider setup cannot go unnoticed.
            checkAccess();
            const { route } = await ctx.fns.voice.effectiveRoute({ agentId });
            if (closed()) return;
            const current = await access();
            if (closed()) return;
            if (current !== "edit") return stop("readOnly");
            let opened: types.voice.VoiceSession;
            try {
                opened = await ctx.fns.voice.session.open({ route, onEvent, signal: controller.signal });
            } catch (error) {
                return stop(publicCode(error), undefined, false, (error as { errorId?: unknown } | null)?.errorId);
            }
            if (closed()) { await opened.cancel(); return; }
            session = opened;
            const { sampleRate, destination } = session.route;
            minPcmBytes = Math.ceil(sampleRate * 0.020) * 2;
            maxPcmBytes = Math.min(FRAME_BYTES - HEADER_BYTES, Math.floor(sampleRate * 0.100) * 2);
            if (minPcmBytes < 2 || maxPcmBytes < minPcmBytes) return stop("routeUnavailable");
            phase = "listening";
            if (mode === "inline") {
                deadline = performance.now() + SESSION_MS;
                duration = setTimeout(() => beginFinish(true), SESSION_MS);
            }
            touch("Voice recognition stopped after 30 seconds without audio.");
            checkAccess(true);
            // Project the public fields; never serialize the session handle or its resolved connection/model.
            forward({ type: "ready", mode, settle: mode === "panel" ? true : undefined, sessionId: session.sessionId, route: session.route.route,
                destination: { kind: destination.kind, label: destination.label }, sampleRate });
        } catch (error) {
            if (!closed()) stop(publicCode(error));
        }
    }

    touch("The voice session start timed out.");
    return {
        disconnect: () => stop(undefined, undefined, true),
        receive(message: string | Buffer) {
            try {
                if (closed()) return;
                if (phase === "listening" && performance.now() >= deadline) beginFinish(true);
                if (typeof message === "string") {
                    if (Buffer.byteLength(message) > CONTROL_BYTES) return stop("backpressure");
                    const control = JSON.parse(message) as { type?: unknown; agentId?: unknown; generation?: unknown; mode?: unknown; id?: unknown } | null;
                    if (control?.type === "settle") return beginBoundary(control.id);
                    if (control?.type === "cancel") return stop();
                    if (control?.type === "finish" && (phase === "listening" || phase === "finishing")) return beginFinish(false);
                    if (phase === "awaiting" && control?.type === "start" && typeof control.agentId === "string" &&
                        /^[A-Za-z0-9_-]{1,128}$/.test(control.agentId) && control.agentId !== "new" &&
                        typeof control.generation === "number" && Number.isSafeInteger(control.generation) && control.generation >= 0) {
                        if (control.mode !== undefined && control.mode !== "panel" && control.mode !== "inline") return stop("protocol");
                        void start(control.agentId, control.mode ?? "inline");
                        return;
                    }
                    return stop("protocol");
                }
                if (phase === "finishing") return;
                if (message.byteLength > FRAME_BYTES) return stop("backpressure");
                const bytes = message.byteLength - HEADER_BYTES;
                if (phase !== "listening" || bytes < minPcmBytes || bytes > maxPcmBytes || bytes % 2 !== 0 ||
                    new DataView(message.buffer, message.byteOffset, HEADER_BYTES).getUint32(0, true) !== sequence) return stop("protocol");
                sequence++;
                touch("Voice recognition stopped after 30 seconds without audio.");
                audioBytes += bytes;
                if (audioBytes > BUFFER_BYTES) return stop("backpressure");
                const pcm = new Uint8Array(message.subarray(HEADER_BYTES));
                if (boundary && pcm.some(byte => byte !== 0)) return stop("protocol");
                if (checking) audio.push(pcm);
                else append(pcm);
            } catch { stop("protocol"); }
        },
    };
}

function publicCode(error: unknown): Code {
    try {
        switch ((error as { code?: unknown } | null)?.code) {
            case "unconfigured": return "unconfigured";
            case "routeUnavailable": return "routeUnavailable";
            case "providerAuth": return "providerAuth";
            case "timeout": return "timeout";
            case "backpressure": return "backpressure";
        }
    } catch { /* Never propagate the thrown object or its message. */ }
    return "provider";
}
