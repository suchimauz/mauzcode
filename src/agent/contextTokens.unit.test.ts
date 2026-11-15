import { describe, expect, test } from "bun:test";
import contextTokens from "./contextTokens";

/** Fake ctx for the stale-usage path: exact provider counting with its cache, then the estimate fallback. */
function fixture(opts: { count?: (input: { tools?: unknown[]; instructions?: string }) => number | null; tools?: unknown[] } = {}) {
    const messages: any[] = [{ role: "user", content: "hello" }, { role: "assistant", content: "hi", idx: 2, tool_calls: [{ id: "t", name: "f", args: {} }] }];
    let lastIdx = messages.length - 1;
    let wireToolsValue = opts.tools ?? [{ name: "tool-a" }];
    const counts: { instructions?: string; tools?: unknown[]; messages: number }[] = [];
    const agent = { id: "a1", model: "prov/native-m", messages, scratchpad: {} };
    const ctx: any = {
        state: { agent: { a1: agent }, agentContextCount: undefined as Map<string, number> | undefined },
        fns: {
            procs: { db: { select: async ({ sql, params }: any) => {
                if (sql.includes("FROM agents")) return [{ model: "prov/native-m", sleep_context: null }];
                if (sql.includes("context_usage")) return [{ payload: JSON.stringify({ usage: { prompt_tokens: 100 }, coveredIdx: 1, model: "prov/native-m" }), ts: 5 }];
                if (sql.includes("MAX(idx)")) return [{ idx: lastIdx }];
                throw new Error("unexpected select: " + sql);
            } } },
            session: {
                getMessages: async () => messages,
                getFullMessages: async () => messages,
                load: async () => agent,
            },
            agent: {
                buildLlmRequest: async ({ agent: snapshot }: any) => { void snapshot; return { instructions: "sys prompt", messages }; },
                wireTools: ({ agent: snapshot }: any) => { void snapshot; return wireToolsValue; },
            },
            models: {
                resolveRoute: async ({ route }: any) => ({ connectionId: "conn1", model: route.replace("prov/", "native-") }),
                countTokens: async (input: { model: string; messages: unknown[]; instructions?: string; tools?: unknown[] }) => {
                    counts.push({ instructions: input.instructions, tools: input.tools, messages: input.messages.length });
                    return opts.count ? opts.count(input) : 777;
                },
            },
            compaction: {
                // Compact mode with a checkpoint newer than the reported usage: the stale-usage path.
                project: async ({ messages: ms }: any) => ({ mode: "compact", messages: ms, activatedAt: 10 }),
                calibration: async () => ({ factor: 1, samples: 0, source: "heuristic" }),
                estimateTokens: async ({ messages: ms }: any) => Math.ceil(ms.map((m: any) => String(m.content).length).reduce((a: number, b: number) => a + b, 0) / 4),
            },
        },
    };
    return {
        ctx, agent, messages,
        measure: () => contextTokens(ctx, null, { agentId: "a1" }),
        setLastIdx: (v: number) => { lastIdx = v; },
        setTools: (v: unknown[]) => { wireToolsValue = v; },
        counts,
        cache: () => ctx.state.agentContextCount,
    };
}

describe("agent.contextTokens exact provider counting", () => {
    test("stale usage uses the provider count and reports it as provider-sourced", async () => {
        const f = fixture();
        const r = await f.measure();
        expect(r).toEqual({ tokens: 777, source: "provider", reportedTokens: 777, deltaTokens: null, reportedAt: 5 });
        expect(f.counts).toHaveLength(1);
        expect(f.counts[0]).toMatchObject({ instructions: "sys prompt", tools: [{ name: "tool-a" }] });
    });
    test("the count is cached per agent, connection, model, index and instructions+tools hash", async () => {
        const f = fixture();
        await f.measure();
        await f.measure();
        expect(f.counts).toHaveLength(1);
        // A later transcript re-counts.
        f.setLastIdx(99);
        await f.measure();
        expect(f.counts).toHaveLength(2);
        // Changed tool schemas must not reuse the old count.
        f.setTools([{ name: "tool-a" }, { name: "tool-b" }]);
        await f.measure();
        expect(f.counts).toHaveLength(3);
        expect(f.cache()!.size).toBe(3);
    });
    test("fresh provider usage skips counting entirely", async () => {
        const f = fixture();
        // coveredIdx covers every message and the usage is newer than any checkpoint → fresh.
        const rows: any[] = [];
        f.ctx.fns.procs.db.select = async ({ sql }: any) => {
            if (sql.includes("FROM agents")) return [{ model: "prov/native-m", sleep_context: null }];
            if (sql.includes("context_usage")) return [{ payload: JSON.stringify({ usage: { prompt_tokens: 100 }, coveredIdx: 999, model: "prov/native-m" }), ts: 50 }];
            if (sql.includes("MAX(idx)")) { rows.push(sql); return [{ idx: 1 }]; }
            throw new Error("unexpected select");
        };
        const r = await f.measure();
        expect(r).toEqual({ tokens: 100, source: "provider", reportedTokens: 100, deltaTokens: 0, reportedAt: 50 });
        expect(rows).toHaveLength(0);
        expect(f.counts).toHaveLength(0);
    });
    test("failed or unavailable counting falls back to the estimate", async () => {
        const f = fixture({ count: () => null });
        const r = await f.measure();
        expect(r.source).toBe("estimate");
        expect(r.tokens).toBeGreaterThan(0);
        const throwing = fixture({ count: () => { throw new Error("provider exploded"); } });
        const r2 = await throwing.measure();
        expect(r2.source).toBe("estimate");
    });
});
