/**
 * Open one normalized voice session over a resolved route and a provider stream
 *
 * Use from the voice WebSocket endpoint (and from tests) as the single entry point for live transcription. It
 * resolves the effective route once — a preference change applies to the next session and no other route is ever
 * substituted — opens the provider, and then owns everything the provider must not:
 *
 * - **Identity and order.** Core is the only source of `order`: it numbers phrases in the sequence it commits audio.
 *   Allocation happens inside the same serialized chain that calls the provider, so the numbers always follow the
 *   audio order even when a transport floods frames. For provider-side turn detection, the provider reports its own
 *   boundaries in audio order and core allocates their orders. Core commits only a remaining turn at finish.
 * - **Revisions.** Every phrase gets a stable `id`, a strictly increasing `revision` and the complete text, never a
 *   delta; exactly one `final` is delivered per order, and an event for a settled or unknown order is dropped.
 * - **Concurrency.** Phrase state is kept per order, so interleaved and out-of-order provider events stay correct: a
 *   late final for an earlier phrase never reorders or overwrites a later one.
 * - **Generations.** Every callback is bound to the generation it was registered under; a callback that survived
 *   `cancel`, or that a provider invokes after the session ended, is dropped instead of reaching a stale client.
 * - **Bounds.** The finish deadline covers queued audio, the last commit, provider finish and phrase settlement.
 *   Abnormal termination immediately requests release, with a separate deadline for provider cancellation.
 * - **Safe failures.** Every error leaving this function carries one closed `types.voice.ErrorCode` and one fixed
 *   sentence from `voice.session.message`; provider exception text is never forwarded. Audio lives only in memory for
 *   the lifetime of the session and is never written to disk, logged or added to agent history.
 * @param opts.route Exact provider/accountName:modelId route, resolved once at open.
 * @param opts.options Recognition options; only fields the resolved model declares are passed to the provider.
 * @param opts.config Segmentation thresholds and deadlines; clamped by voice.session.limits.
 * @param opts.onEvent Ordered event sink after open; opening failures reject instead. A throwing consumer never breaks the session.
 * @param opts.signal Owner transport lifetime, including asynchronous provider opening.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Exact provider/accountName:modelId route, resolved once at open. */
        route: string;
        /** Recognition options; only fields the resolved model declares are passed to the provider. */
        options?: types.voice.RecognitionOptions;
        /** Segmentation thresholds and deadlines; clamped by voice.session.limits. */
        config?: types.voice.VoiceSessionConfig;
        /** Ordered event sink after open; opening failures reject instead. A throwing consumer never breaks the session. */
        onEvent: (event: types.voice.SessionEvent) => void;
        /** Owner transport lifetime, including asynchronous provider opening. */
        signal?: AbortSignal;
    },
): Promise<types.voice.VoiceSession> {
    if (opts.signal?.aborted) throw ctx.fns.voice.session.failure({ code: "provider" });
    const limits = ctx.fns.voice.session.limits({ config: opts.config });
    const route = await ctx.fns.voice.resolveRoute({ route: opts.route });
    if (opts.signal?.aborted) throw ctx.fns.voice.session.failure({ code: "provider" });
    const sessionId = crypto.randomUUID();
    const controller = new AbortController();

    let state: "open" | "closing" | "closed" = "open";
    let generation = 0;
    let endCode: types.voice.ErrorCode | null = null;

    // One entry per order core has committed; a settled entry accepts no further revision.
    const orders = new Map<number, { id: string; text: string; revision: number; settled: boolean }>();
    // Upstream turn identity → core order, used only for provider-selected boundaries.
    const providerOrders = new Map<string, number>();
    let serverCommittedBytes = 0;
    let sentBytes = 0;
    let ready = false;
    let nextOrder = 0;
    let settledCount = 0;
    let unsettled = 0;
    let settleWaiters: (() => void)[] = [];

    const usage = { audioSeconds: 0 };

    let vad = ctx.fns.voice.session.vadState({
        turnDetection: route.model.capabilities.turnDetection === "server" ? "server" : "client",
        sampleRate: route.sampleRate,
        limits,
    });

    const status = (): types.voice.SessionStatus => ({
        sessionId,
        state,
        generation,
        committed: nextOrder,
        settled: settledCount,
        audioBytes: sentBytes,
        audioWindows: Math.floor(sentBytes / vad.frameBytes),
        usage: { audioSeconds: usage.audioSeconds },
    });

    const deliver = (event: types.voice.SessionEvent): void => {
        try {
            opts.onEvent(event);
        } catch {
            // A consumer that throws is the consumer's problem: the session keeps its own guarantees.
        }
    };

    const releaseWaiters = (): void => {
        const pending = settleWaiters;
        settleWaiters = [];
        for (const resolve of pending) resolve();
    };

    // endWith() mutates `state` from inside a closure, which TypeScript's flow analysis cannot follow; a
    // helper keeps every later check honest instead of relying on a narrowing that is no longer true.
    const isClosed = (): boolean => state === "closed";

    let stream: types.voice.VoiceStream | undefined;
    let release: Promise<void> | undefined;
    const releaseStream = (): Promise<void> | undefined => {
        const opened = stream;
        if (opened && !release) {
            stream = undefined;
            release = bounded(Promise.resolve().then(() => opened.cancel()), limits.cancelTimeoutMs).catch(() => {});
        }
        return release;
    };

    const abortFromTransport = () => endWith();
    const close = (): void => {
        opts.signal?.removeEventListener("abort", abortFromTransport);
        state = "closed";
        generation++;
        vad = { ...vad, carry: new Uint8Array(0), held: [], energies: [] };
        orders.clear();
        providerOrders.clear();
        unsettled = 0;
        releaseWaiters();
    };

    // Invalidate callbacks before aborting: a provider can report a failure synchronously on abort. Release does
    // not depend on the client seeing the error, nor on the provider respecting the AbortSignal.
    const endWith = (code?: types.voice.ErrorCode): void => {
        if (isClosed()) return;
        endCode = code ?? null;
        close();
        void releaseStream();
        controller.abort();
        if (ready && code) deliver({ type: "error", code, message: ctx.fns.voice.session.message({ code }) });
    };

    /** Allocate a phrase for one commit and register it as unsettled. */
    const allocate = (): number => {
        const order = nextOrder++;
        orders.set(order, { id: `${sessionId}:${order}`, text: "", revision: 0, settled: false });
        unsettled++;
        return order;
    };

    /** Settle one order and wake a waiting finish once nothing is pending. Returns its terminal revision. */
    const settle = (order: number): number => {
        const entry = orders.get(order);
        if (!entry || entry.settled) return 0;
        entry.settled = true;
        unsettled--;
        settledCount++;
        entry.revision++;
        if (unsettled <= 0) releaseWaiters();
        return entry.revision;
    };

    /**
     * Report one terminal provider failure, but only while the callback that produced it is still current: a
     * provider that fails after `cancel` must not end a session the client already left.
     */
    const onEmitFailure = (registeredGeneration: number, error: { code: types.voice.ErrorCode; message: string }): void => {
        if (registeredGeneration !== generation || state === "closed") return;
        endWith(codeOf(error));
    };

    const onEmit = (registeredGeneration: number, event: types.voice.PhraseEvent): void => {
        // `registeredGeneration` is the snapshot taken when the callback was created, not the live counter: a
        // provider that keeps a reference past cancel must not reach a client that already moved on.
        if (!ready || registeredGeneration !== generation || isClosed()) return;
        if (!event || typeof event !== "object") return;
        if (event.type === "committed") {
            if (vad.turnDetection !== "server" || typeof event.turnId !== "string" || !event.turnId ||
                providerOrders.has(event.turnId)) return;
            if (!Number.isSafeInteger(event.endByte) || event.endByte % 2 !== 0 ||
                event.endByte <= serverCommittedBytes || event.endByte > sentBytes) {
                endWith("provider");
                return;
            }
            serverCommittedBytes = event.endByte;
            providerOrders.set(event.turnId, allocate());
            return;
        }
        if (event.type === "usage") {
            const seconds = (event as { audioSeconds?: unknown }).audioSeconds;
            if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) usage.audioSeconds += seconds;
            return;
        }
        if (event.type !== "revision" && event.type !== "final" && event.type !== "failed") return;
        const order = "order" in event ? event.order : providerOrders.get(event.turnId);
        if (order === undefined) return;
        const entry = orders.get(order);
        if (!entry || entry.settled) return;
        if (event.type === "revision") {
            entry.text = typeof event.text === "string" ? event.text : entry.text;
            entry.revision++;
            deliver({ type: "phrase", id: entry.id, order, revision: entry.revision, text: entry.text, final: false });
            return;
        }
        if (event.type === "failed") {
            settle(order);
            deliver({ type: "phraseFailed", id: entry.id, order, reason: "provider" });
            return;
        }
        entry.text = typeof event.text === "string" ? event.text : entry.text;
        const revision = settle(order);
        deliver({ type: "phrase", id: entry.id, order, revision, text: entry.text, final: true });
    };

    const signal = controller.signal;
    const withAbort = <T>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        void work.then(
            value => { signal.removeEventListener("abort", abort); resolve(value); },
            error => { signal.removeEventListener("abort", abort); reject(error); },
        );
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
    });

    let voice: types.voice.VoiceStream;
    opts.signal?.addEventListener("abort", abortFromTransport, { once: true });
    try {
        const { definition, conn } = await withAbort(ctx.fns.voice.connections.resolve({
            id: route.connectionId,
            signal: controller.signal,
        }));
        if (isClosed()) throw signal.reason;
        // Snapshot the generation so this provider's callbacks go stale the moment the session ends.
        const registeredGeneration = generation;
        const streamSession: types.voice.StreamSession = {
            sampleRate: route.sampleRate,
            options: narrowOptions(route, opts.options),
            signal: controller.signal,
            emit: (event: types.voice.PhraseEvent) => onEmit(registeredGeneration, event),
            fail: (error: { code: types.voice.ErrorCode; message: string }) => onEmitFailure(registeredGeneration, error),
        };
        const opening = definition.open(ctx, conn, streamSession).then(opened => {
            stream = opened;
            // A provider can call fail and only later return its handle. Release it even after open has rejected.
            if (isClosed()) void releaseStream();
            return opened;
        });
        voice = await withAbort(opening);
        if (isClosed()) throw signal.reason;
        ready = true;
    } catch (error) {
        const code = endCode ?? codeOf(error);
        endWith(code);
        throw ctx.fns.voice.session.failure({ code });
    }

    // Appends and commits share one chain, so provider calls happen in stream order even if a transport floods them.
    let chain: Promise<unknown> = Promise.resolve();
    let queuedBytes = 0;
    const enqueue = <T>(work: () => Promise<T>): Promise<T | undefined> => {
        const run = chain.then(async () => {
            if (isClosed()) return undefined;
            try {
                return await work();
            } catch (error) {
                endWith(codeOf(error));
                return undefined;
            }
        });
        chain = run;
        return run;
    };

    /**
     * Apply an ordered step plan inside the chain: audio is appended exactly where the detector put it, and every
     * commit step allocates its order at that same point, so order always follows audio.
     */
    const applyPlan = async (steps: types.voice.VadStep[]): Promise<number[]> => {
        const committed: number[] = [];
        for (const step of steps) {
            if (state === "closed") return committed;
            if (step.type === "audio") {
                if (!step.pcm.byteLength) continue;
                sentBytes += step.pcm.byteLength;
                await withAbort(voice.append(step.pcm));
                continue;
            }
            const order = allocate();
            committed.push(order);
            await withAbort(voice.commit(order));
        }
        return committed;
    };

    const append = async (pcm: Uint8Array): Promise<void> => {
        // Audio after finish or cancel is dropped: a closing session never grows its transcript.
        if (state !== "open") return;
        const frame = pcm instanceof Uint8Array ? pcm : new Uint8Array(0);
        if (!frame.byteLength) return;
        if (queuedBytes + frame.byteLength > limits.maxBufferedBytes) {
            // The consumer pushes faster than the provider accepts: end visibly instead of dropping audio silently.
            endWith("backpressure");
            return;
        }
        const pushed = ctx.fns.voice.session.vadPush({ state: vad, pcm: frame });
        vad = pushed.state;
        queuedBytes += frame.byteLength;
        try {
            await enqueue(() => applyPlan(pushed.steps));
        } finally {
            queuedBytes -= frame.byteLength;
        }
    };

    const commitNow = async (): Promise<number | undefined> => {
        if (state !== "open" || vad.turnDetection === "server") return undefined;
        // Everything the detector still holds is this phrase's audio; the explicit commit closes it exactly there.
        const flushed = ctx.fns.voice.session.vadFlush({ state: vad });
        vad = flushed.state;
        if (!flushed.committed) return undefined;
        // Allocation happens in the chain, so an explicit commit cannot overtake an earlier queued plan.
        const committed = await enqueue(() => applyPlan(flushed.steps));
        return isClosed() ? undefined : committed?.[0];
    };

    const cancel = async (code?: types.voice.ErrorCode): Promise<void> => {
        endWith(code); // Omit the code for a deliberate, silent cancel.
        await release;
    };

    const finish = async (): Promise<{ ok: boolean; code?: types.voice.ErrorCode }> => {
        if (state !== "open") return { ok: false, ...(endCode ? { code: endCode } : {}) };
        state = "closing";
        const timer = setTimeout(() => endWith("timeout"), limits.finishTimeoutMs);
        try {
            // Inspect the remaining audio inside the chain, after any boundaries reported by queued appends.
            await enqueue(async () => {
                const flushed = ctx.fns.voice.session.vadFlush({ state: vad, serverCommittedBytes });
                vad = flushed.state;
                await applyPlan(flushed.steps);
            });
            if (!isClosed()) {
                await withAbort(voice.finish());
                while (unsettled > 0) await new Promise<void>(resolve => settleWaiters.push(resolve));
            }
            if (!isClosed()) {
                close();
                stream = undefined; // A successful provider finish has already released its resources.
                deliver({ type: "completed" });
                return { ok: true };
            }
        } catch (error) {
            endWith(codeOf(error));
        } finally {
            clearTimeout(timer);
        }
        return { ok: false, ...(endCode ? { code: endCode } : {}) };
    };

    return { sessionId, route, append, commit: commitNow, finish, cancel, status };
}

/** Map a thrown provider error onto the closed code set, never copying its message. */
function codeOf(error: unknown): types.voice.ErrorCode {
    const known: types.voice.ErrorCode[] = [
        "unauthorized", "readOnly", "superseded", "unconfigured", "routeUnavailable",
        "providerAuth", "provider", "timeout", "backpressure", "protocol",
    ];
    try {
        const code = (error as { code?: unknown } | null)?.code;
        if (known.includes(code as types.voice.ErrorCode)) return code as types.voice.ErrorCode;
    } catch {
        // Even an invalid provider error object gets the same safe fallback.
    }
    return "provider";
}

/** Pass only the recognition options the resolved model declares, so a provider never re-checks support. */
function narrowOptions(
    route: types.voice.ResolvedRoute,
    options: types.voice.RecognitionOptions | undefined,
): types.voice.RecognitionOptions {
    const out: types.voice.RecognitionOptions = {};
    if (!options) return out;
    const capabilities = route.model.capabilities;
    if (capabilities.languages && options.languages !== undefined) out.languages = options.languages;
    if (capabilities.keywords && options.keywords !== undefined) out.keywords = options.keywords;
    if (capabilities.prompt && options.prompt !== undefined) out.prompt = options.prompt;
    if (capabilities.delay && options.delay !== undefined) out.delay = options.delay;
    return out;
}

/** Race a promise against a deadline; the deadline outcome rejects with a `timeout` code. */
async function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(Object.assign(new Error("Voice operation exceeded its deadline"), { code: "timeout" }));
        }, ms);
    });
    work.catch(() => {});
    try {
        return await Promise.race([work, deadline]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}
