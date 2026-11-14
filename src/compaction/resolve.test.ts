import { describe, expect, test } from "bun:test";
import compact from "./$compaction_default";
import resolve from "./resolve";
import identity from "./modelIdentity";
import contextWindow from "./contextWindow";
import portable from "./portable";
import anthropicMessages from "../models/protocol/anthropic/toAnthropicMessages";

const model = "custom/work:native/model:v2";
function fixture(nativeCompaction = false, window?: number) {
    const calls: types.models.CallRequest[] = [];
    const native: object[] = [];
    const route = { route: model, provider: "custom", accountName: "work", modelId: "native/model:v2", model: "native/model:v2", connectionId: "connection", nativeCompaction, contextWindow: window };
    const ctx: any = { state: { compaction: { compactors: { default: { provider: "default", compact }, custom: { compact: () => { throw Error("legacy dispatch"); } } } } }, fns: {
        models: {
            resolveRoute: async (opts: { route: string }) => { expect(opts).toEqual({ route: model }); return route; },
            call: async (opts: types.models.CallRequest) => { calls.push(opts); return { text: "summary" }; },
            compact: async (opts: object) => { native.push(opts); const item = { type: "compaction", encrypted_content: "opaque", id: "checkpoint" }; return { item, checkpoint: { kind: "native-checkpoint", version: 1, provider: route.provider, connectionId: route.connectionId, model: route.model, payload: item }, responseId: "response" }; },
        }, procs: { log: { warn: () => {} } },
    } };
    const opts = { model, sessionId: "child", instructions: "system", focus: "retain identifiers", messages: [{ role: "user", content: "hello" }], signal: new AbortController().signal };
    return { ctx, calls, native, opts, route };
}
describe("compaction models facade", () => {
    test("selects only default; capability controls native/summary, not provider id", async () => {
        for (const native of [false, true]) {
            const { ctx } = fixture(native);
            expect(await resolve(ctx, null, { model })).toMatchObject({ compact, provider: "default", fallback: !native });
        }
    });
    test("identity and cached window use route resolver; absent metadata defaults to 200k", async () => {
        const { ctx, route } = fixture(false, 123456);
        expect(await identity(ctx, null, { model })).toBe(route);
        expect(await contextWindow(ctx, null, { model })).toBe(123456);
        route.contextWindow = undefined;
        expect(await contextWindow(ctx, null, { model })).toBe(200000);
    });
    for (const code of ["LEGACY_ROUTE", "CONNECTION_DISABLED", "MODEL_DISABLED_BY_USER", "CONNECTION_NOT_FOUND"]) {
        test(`${code} propagates unchanged before any model request`, async () => {
            const { ctx, opts, calls, native } = fixture(); const error = new Error(code);
            ctx.fns.models.resolveRoute = async (o: { route: string }) => { expect(o).toEqual({ route: model }); throw error; };
            for (const fn of [compact, resolve, identity, contextWindow]) await expect(fn(ctx, null, opts)).rejects.toBe(error);
            expect(calls).toEqual([]); expect(native).toEqual([]);
        });
    }
    test("native preserves encrypted payload, focus, instructions, tools and signal", async () => {
        const { ctx, opts, native, calls } = fixture(true);
        opts.messages.push({ role: "assistant", content: "tool context" });
        const result = await compact(ctx, null, opts);
        expect(native).toEqual([{ connectionId: "connection", model: "native/model:v2", sessionId: "child", instructions: opts.instructions, messages: opts.messages, focus: opts.focus, signal: opts.signal }]);
        expect(JSON.parse(result.message.content)).toEqual({ kind: "native-checkpoint", version: 1, provider: "custom", connectionId: "connection", model: "native/model:v2", payload: { type: "compaction", encrypted_content: "opaque", id: "checkpoint" } });
        expect(result.message.message_type).toBe("codex_compaction");
        expect(portable(ctx, null, { model, producedBy: model, messages: [result.message] })).toEqual([result.message]);
        expect(calls).toEqual([]);
    });
    test("signed payload remains verbatim and replays through the models protocol", async () => {
        const { ctx, opts } = fixture(true);
        const item = { type: "compaction", content: " summary \n", signature: "sig", extra: "preserved" };
        ctx.fns.models.compact = async () => ({ item, responseId: "r" });
        const result = await compact(ctx, null, opts);
        expect(JSON.parse(result.message.content)).toEqual(item);
        expect(result.summary).toBe(item.content);
        const replay = anthropicMessages(ctx, null, { messages: [result.message, { role: "user", content: "next" }] });
        expect(replay[0]!.content[0]).toEqual(item);
    });
    test("native failures and malformed payloads never fall back", async () => {
        const { ctx, opts, calls } = fixture(true); const error = new Error("context_length_exceeded");
        ctx.fns.models.compact = async () => { throw error; };
        await expect(compact(ctx, null, opts)).rejects.toBe(error);
        for (const item of [null, {}, { type: "compaction", content: "x" }, { type: "compaction", encrypted_content: "" }]) {
            ctx.fns.models.compact = async () => ({ item });
            await expect(compact(ctx, null, opts)).rejects.toThrow("invalid checkpoint");
        }
        expect(calls).toEqual([]);
    });
    test("summary overflow trims oldest items without orphan tool results or mutating input", async () => {
        const { ctx, opts, calls, native } = fixture();
        const messages = [{ role: "user", content: "a" }, { role: "assistant", content: "", tool_calls: [{ id: "c1" }] }, { role: "tool", content: "r", tool_call_id: "c1" }, { role: "user", content: "b" }, { role: "assistant", content: "c" }];
        ctx.fns.models.call = async (o: types.models.CallRequest) => { calls.push(o); if (JSON.parse(o.user).length > 2) throw Error("context_length_exceeded"); return { text: " summary " }; };
        const result = await compact(ctx, null, { ...opts, messages });
        expect(calls.map(c => JSON.parse(c.user).length)).toEqual([5, 4, 2]);
        for (const c of calls) expect(c).toMatchObject({ connectionId: "connection", model: "native/model:v2", signal: opts.signal, sessionId: "child" });
        expect(calls[0]!.system).toContain(opts.focus);
        expect(messages).toHaveLength(5); expect(native).toEqual([]);
        expect(result.summary).toBe("summary"); expect(result.message.message_type).toBe("compaction_summary");
    });
    test("structured overflow trims opaque errors; quota metadata prevents text-based retry", async () => {
        const { ctx, opts, calls } = fixture();
        opts.messages.push({ role: "user", content: "second" });
        ctx.fns.models.call = async (o: types.models.CallRequest) => {
            calls.push(o);
            if (calls.length === 1) throw Object.assign(new Error("Provider request failed"), { failure: { code: "OVERFLOW" } });
            return { text: "summary" };
        };
        await compact(ctx, null, opts);
        expect(calls.map(o => JSON.parse(o.user).length)).toEqual([2, 1]);
        const error = Object.assign(new Error("context_length_exceeded"), { failure: { code: "QUOTA_EXHAUSTED" } });
        calls.length = 0;
        ctx.fns.models.call = async (o: types.models.CallRequest) => { calls.push(o); throw error; };
        await expect(compact(ctx, null, opts)).rejects.toBe(error);
        expect(calls).toHaveLength(1);
    });
    test("summary errors are terminal; cancellation reaches both paths", async () => {
        for (const native of [true, false]) {
            const { ctx, opts, calls } = fixture(native); const controller = new AbortController(); opts.signal = controller.signal;
            const error = new Error("cancelled"); controller.abort(error);
            await expect(compact(ctx, null, opts)).rejects.toBe(error); expect(calls).toEqual([]);
        }
        const { ctx, opts } = fixture(); const error = new Error("quota exhausted");
        ctx.fns.models.call = async () => { throw error; };
        await expect(compact(ctx, null, opts)).rejects.toBe(error);
        ctx.fns.models.call = async () => ({ text: " " });
        await expect(compact(ctx, null, opts)).rejects.toThrow("summary was empty");
    });
});
