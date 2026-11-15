import { describe, expect, test } from "bun:test";
import retryCodes from "../agent/retryCodes";
import retryDecision from "../agent/retryDecision";
import modelCallWithRetry from "./modelCallWithRetry";

// Offline harness: the real decision function over a stubbed settings chain, an
// in-memory agent, and a call that fails as many times as the test says.
function harness(failures: any[], delay = 5) {
    const agent: any = { id: "parent", scratchpad: { compaction: { sourceAgentId: "parent" } } };
    const ctx: any = {
        state: { agent: { parent: agent, child: { id: "child", scratchpad: { compaction: { sourceAgentId: "parent" } } } } },
        fns: {
            settings: { get: async ({ key }: any) => key === "retryPolicy" ? { initialDelayMs: delay, maxDelayMs: delay, jitterRatio: 0 } : undefined },
            procs: { log: { warn: () => {} }, events: { emit: () => {} }, db: { select: async () => [] } },
            agent: {},
        },
    };
    ctx.fns.agent.retryCodes = (o: any) => retryCodes(ctx, null, o);
    ctx.fns.agent.retryDecision = (o: any) => retryDecision(ctx, null, o);
    const source = { id: "parent", scratchpad: agent.scratchpad };
    const queue = [...failures];
    let calls = 0;
    return {
        ctx, agent, source, get calls() { return calls; },
        call: () => modelCallWithRetry(ctx, null, {
            sessionId: "child", provider: "custom",
            call: async () => {
                calls++;
                const next = queue.shift();
                if (next) throw next;
                return { text: "summary" };
            },
        }),
    };
}
const transient = () => Object.assign(new Error("Model transport failed"), { code: "TRANSPORT" });

describe("compaction model-call retry", () => {
    test("a transient failure is retried and the compaction still completes", async () => {
        const h = harness([transient()]);
        expect(await h.call()).toEqual({ text: "summary" });
        expect(h.calls).toBe(2);
    });

    test("the retry budget is per call and exhausts like a turn's", async () => {
        const h = harness(Array.from({ length: 6 }, transient));
        await expect(h.call()).rejects.toThrow("Model transport failed");
        // Five retries after the first attempt, exactly as the default policy says.
        expect(h.calls).toBe(6);
    });

    test("a second call starts with a fresh budget", async () => {
        const h = harness([transient()]);
        await h.call();
        await h.call();
        expect(h.calls).toBe(3);
    });

    test("codes that waiting cannot fix fail at once", async () => {
        for (const error of [
            Object.assign(new Error("overflow"), { failure: { code: "OVERFLOW", retryable: true } }),
            Object.assign(new Error("auth"), { code: "AUTH", retryable: false }),
            new Error("compaction summary was empty"),
        ]) {
            const h = harness([error, error]);
            await expect(h.call()).rejects.toBe(error);
            expect(h.calls).toBe(1);
        }
    });

    test("the wait shows a transient status and clears it before the next attempt", async () => {
        const h = harness([transient()]);
        const seen: any[] = [];
        const original = h.ctx.fns.procs.events.emit;
        h.ctx.fns.procs.events.emit = () => { seen.push({ ...h.agent.scratchpad.compactionRetry }); };
        expect(await h.call()).toEqual({ text: "summary" });
        h.ctx.fns.procs.events.emit = original;
        // Shown with the attempt number, hidden again once the attempt starts.
        expect(seen[0]).toMatchObject({ attempt: 1, maxRetries: 5, code: "TRANSPORT" });
        expect(h.agent.scratchpad.compactionRetry).toBeUndefined();
    });

    test("nothing durable is written for a compaction retry", async () => {
        const writes: any[] = [];
        const h = harness([transient()]);
        h.ctx.fns.procs.db = {
            select: async () => [],
            run: async (query: any) => { writes.push(query); return { changes: 0, rows: [] }; },
            insert: async (query: any) => { writes.push(query); return { changes: 0, rows: [] }; },
        };
        await h.call();
        expect(writes).toEqual([]);
    });

    test("cancelling during the wait ends it immediately and sends no further request", async () => {
        const h = harness([transient()], 30_000);
        const controller = new AbortController();
        const pending = modelCallWithRetry(h.ctx, null, {
            sessionId: "child", provider: "custom", signal: controller.signal,
            call: async () => { throw transient(); },
        });
        setTimeout(() => controller.abort(), 5);
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(h.agent.scratchpad.compactionRetry).toBeUndefined();
    });

    test("a cancelled compaction sends nothing at all", async () => {
        const h = harness([]);
        const controller = new AbortController();
        controller.abort();
        await expect(modelCallWithRetry(h.ctx, null, {
            sessionId: "child", call: async () => ({ text: "never" }), signal: controller.signal,
        })).rejects.toMatchObject({ name: "AbortError" });
        expect(h.calls).toBe(0);
    });
});
