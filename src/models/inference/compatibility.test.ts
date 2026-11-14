import { expect, test } from "bun:test";

async function fixture() {
    const ctx: any = { state: { models: { providers: {} } }, fns: { models: { inference: {}, connections: {} } } };
    for (const name of ["assertModelEnabled", "checkInput", "compact", "failure", "resolveReasoning", "stream"]) {
        const leaf = (await import(`./${name}.ts`)).default;
        ctx.fns.models.inference[name] = (opts: unknown) => leaf(ctx, null, opts);
    }
    // Only stream and compact remain root facade delegates.
    for (const name of ["compact", "stream"]) {
        const root = (await import(`../${name}.ts`)).default;
        ctx.fns.models[name] = (opts: unknown) => root(ctx, null, opts);
    }
    const safeMessage = (await import("../connections/safeMessage.ts")).default;
    ctx.fns.models.connections.safeMessage = (opts: unknown) => safeMessage(ctx, null, opts as never);
    const view = { id: "fixture-connection", provider: "fixture", enabled: true, disabledModels: [] as string[] };
    const calls = { resolve: 0, stream: 0, compact: 0 };
    const result = { text: "ok", thinking: "", toolCalls: [], finishReason: "stop", usage: { prompt_tokens: 7 }, quota: { source: "headers", windows: [] } };
    let request: any;
    const definition: any = {
        capabilities: { checkpoints: true, continuationState: true },
        stream: async (_ctx: unknown, _conn: unknown, req: any) => {
            calls.stream++;
            request = req;
            req.onEvent?.({ type: "text_delta", delta: "one" });
            req.onEvent?.({ type: "text_delta", delta: "two" });
            return result;
        },
        compact: async () => { calls.compact++; return { item: { type: "compaction", encrypted_content: "fixture" }, usage: {} }; },
    };
    ctx.state.models.providers.fixture = { definition };
    ctx.fns.models.connections.get = async () => view;
    ctx.fns.models.connections.resolve = async () => { calls.resolve++; return { view, definition, conn: {} }; };
    return { ctx, view, calls, result, definition, request: () => request };
}

const opts = { connectionId: "fixture-connection", model: "m", sessionId: "s", runId: "r", instructions: "fixture", messages: [] };
for (const entry of ["root", "leaf"]) {
    test(`${entry}: inference rejects disabled and unsupported requests before resolution`, async () => {
        const { ctx, view, calls, definition } = await fixture();
        const api = entry === "root" ? ctx.fns.models : ctx.fns.models.inference;
        view.enabled = false;
        for (const op of ["stream", "compact"]) await expect(api[op](opts)).rejects.toMatchObject({ code: "CONNECTION_DISABLED" });
        view.enabled = true;
        view.disabledModels = ["m"];
        for (const op of ["stream", "compact"]) await expect(api[op](opts)).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
        view.disabledModels = [];
        delete definition.stream;
        delete definition.compact;
        for (const op of ["stream", "compact"]) await expect(api[op](opts)).rejects.toMatchObject({ code: "UNSUPPORTED" });
        expect(calls).toEqual({ resolve: 0, stream: 0, compact: 0 });
    });

    test(`${entry}: checkpoint/state identity and cancellation are checked before provider dispatch`, async () => {
        const { ctx, calls } = await fixture();
        const api = entry === "root" ? ctx.fns.models : ctx.fns.models.inference;
        const checkpoint = { kind: "native-checkpoint", version: 1, provider: "fixture", connectionId: opts.connectionId, model: "m", payload: {} };
        for (const key of ["provider", "connectionId", "model"]) {
            for (const op of ["stream", "compact"]) await expect(api[op]({ ...opts, messages: [{ type: "checkpoint", checkpoint: { ...checkpoint, [key]: "foreign" } }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        }
        const state = { provider: "fixture", connectionId: opts.connectionId, sessionId: "s", runId: "r", data: { cursor: "fixture" } };
        for (const key of ["provider", "connectionId", "sessionId", "runId"]) await expect(api.stream({ ...opts, state: { ...state, [key]: "foreign" } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        const controller = new AbortController();
        controller.abort();
        for (const op of ["stream", "compact"]) await expect(api[op]({ ...opts, signal: controller.signal })).rejects.toMatchObject({ code: "CANCELLED", status: 499 });
        expect(calls).toEqual({ resolve: 0, stream: 0, compact: 0 });
    });

    test(`${entry}: ordered callback, signal and result identities, usage/quota and provider errors survive`, async () => {
        const { ctx, calls, result, definition, request } = await fixture();
        const api = entry === "root" ? ctx.fns.models : ctx.fns.models.inference;
        const signal = new AbortController().signal;
        const events: unknown[] = [];
        const onEvent = (event: unknown) => events.push(event);
        expect(await api.stream({ ...opts, signal, onEvent })).toBe(result);
        expect(request().signal).toBe(signal);
        expect(request().onEvent).toBe(onEvent);
        expect(events).toEqual([{ type: "text_delta", delta: "one" }, { type: "text_delta", delta: "two" }]);
        expect(result.usage).toEqual({ prompt_tokens: 7 });
        expect(result.quota).toEqual({ source: "headers", windows: [] });
        expect(calls).toEqual({ resolve: 1, stream: 1, compact: 0 });
        const compacted = await api.compact(opts);
        expect(compacted.checkpoint).toMatchObject({ kind: "native-checkpoint", provider: "fixture", connectionId: opts.connectionId, model: "m" });
        const error = Object.assign(new Error("fixture failure"), { code: "FIXTURE", retryable: false });
        definition.stream = async () => { throw error; };
        definition.compact = async () => { throw error; };
        for (const op of ["stream", "compact"]) await expect(api[op](opts)).rejects.toBe(error);
    });
}
