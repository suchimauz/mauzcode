import { describe, expect, test } from "bun:test";
import { mkModelsTestCtx as mkTestCtx } from './modelsTestCtx.entry';

const RESETS_AT = Date.now() + 3 * 24 * 3_600_000;

function limitInfo(over: Partial<types.models.FailureInfo> = {}): types.models.FailureInfo {
    return {
        code: "QUOTA_EXHAUSTED", classification: "quota", acceptance: "rejected", replaySafe: true,
        retryable: false,
        resetAt: RESETS_AT,
        ...over,
    } as types.models.FailureInfo;
}

describe("agent.setModel", () => {
    test("changes the model, records it visibly, and reports the previous one", async () => {
        const ctx: any = await mkTestCtx();
        const a = await ctx.fns.agent.start({ model: "mock/default:test" });

        const result = await ctx.fns.agent.setModel({ id: a.id, model: "mock/default:other" });

        expect(result).toMatchObject({ changed: [a.id], model: "mock/default:other", from: "mock/default:test" });
        const row = (await ctx.fns.procs.db.select({ sql: "SELECT model FROM agents WHERE id = ?", params: [a.id] }))[0];
        expect(row.model).toBe("mock/default:other");
        expect((await ctx.fns.session.getEvents({ id: a.id })).at(-1)).toMatchObject({ type: "model_changed", from: "mock/default:test", to: "mock/default:other" });
    });

    test("an unknown provider fails here, not on the agent's next turn", async () => {
        const ctx: any = await mkTestCtx();
        const a = await ctx.fns.agent.start({ model: "mock/default:test" });
        await expect(ctx.fns.agent.setModel({ id: a.id, model: "nosuch:model" })).rejects.toThrow(/Legacy model route/);
    });

    test("switching model lifts the parking and resumes the unanswered work", async () => {
        const ctx: any = await mkTestCtx();
        const a = await ctx.fns.agent.start({ model: "mock/default:test" });
        await ctx.fns.session.appendMessage({ id: a.id, message: { role: "user", content: "do the thing" } });
        await ctx.fns.agent.parkOnUsageLimit({ originAgentId: a.id, info: limitInfo() });

        await ctx.fns.agent.setModel({ id: a.id, model: "mock/default:other" });

        expect((await ctx.fns.session.load({ id: a.id })).scratchpad.parked).toBeUndefined();
        const row = (await ctx.fns.procs.db.select({ sql: "SELECT wake_at, next_run_at FROM agents WHERE id = ?", params: [a.id] }))[0];
        expect(row.wake_at).toBeNull();
        expect(row.next_run_at).not.toBeNull();
    });

    test("scope=provider moves the whole parked group off the exhausted credential", async () => {
        const ctx: any = await mkTestCtx();
        const a = await ctx.fns.agent.start({ model: "mock/default:test" });
        const b = await ctx.fns.agent.start({ model: "mock/default:test" });
        const other = await ctx.fns.agent.start({ model: "mock/second:test" });
        await ctx.fns.agent.parkOnUsageLimit({ originAgentId: a.id, info: limitInfo() });

        const result = await ctx.fns.agent.setModel({ id: a.id, model: "mock/second:test", scope: "provider" });

        expect(result.changed.sort()).toEqual([a.id, b.id].sort());
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT id, model FROM agents WHERE id IN (?, ?, ?)", params: [a.id, b.id, other.id] });
        for (const row of rows) expect(row.model).toBe("mock/second:test");
    });

    test("scope=agent leaves the other parked agents alone", async () => {
        const ctx: any = await mkTestCtx();
        const a = await ctx.fns.agent.start({ model: "mock/default:test" });
        const b = await ctx.fns.agent.start({ model: "mock/default:test" });
        await ctx.fns.agent.parkOnUsageLimit({ originAgentId: a.id, info: limitInfo() });

        await ctx.fns.agent.setModel({ id: a.id, model: "mock/default:other" });

        expect((await ctx.fns.session.load({ id: b.id })).scratchpad.parked).toMatchObject({ reason: "usage_limit" });
    });

    test("setting the same model twice is a no-op, not a second event", async () => {
        const ctx: any = await mkTestCtx();
        const a = await ctx.fns.agent.start({ model: "mock/default:test" });
        expect((await ctx.fns.agent.setModel({ id: a.id, model: "mock/default:test" })).changed).toEqual([]);
        expect((await ctx.fns.session.getEvents({ id: a.id })).some((e: any) => e.type === "model_changed")).toBe(false);
    });
});
