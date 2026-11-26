import { expect, test } from "bun:test";
import setModel from "./setModel";

function fixture() {
    const calls: string[] = [];
    const live: any = { model: "mock/default:old", activeRunCount: 0, abortController: new AbortController() };
    let state = "idle";
    let claimOnUpdate = false;
    let storedModel = "mock/default:old";
    const ctx: any = { state: { agent: { a: live } }, fns: {
        models: { resolveRoute: async ({route}: any) => ({route,provider:'mock',accountName:'default'}) },
        procs: { db: {
            select: async ({ sql }: any) => sql.includes("WHERE id") ? [{ id: "a", model: storedModel, run_state: state, scratchpad: "{}" }] : [],
            run: async ({ sql, params }: any) => {
                calls.push("update");
                if (claimOnUpdate) state = "running";
                if (sql.includes("run_state = 'idle'") && state !== "idle") return { changes: 0 };
                storedModel = params[0];
                return { changes: 1 };
            },
        } },
        session: { appendEvent: async () => { calls.push("event"); } },
        agent: { unpark: async () => { calls.push("unpark"); }, autoCompactIfNeeded: async () => { calls.push("compact"); } },
        events: { refreshAgentMeta: () => {}, emitAgentsChanged: () => {} },
    } };
    return { ctx, live, calls, state: (s: string) => { state = s; }, race: () => { claimOnUpdate = true; }, model: () => storedModel };
}

for (const kind of ["worker", "direct"] as const) {
    test(`setModel rejects an active ${kind} before any mutation`, async () => {
        const f = fixture();
        if (kind === "worker") f.state("running"); else f.live.activeRunCount = 1;
        await expect(setModel(f.ctx, null, { id: "a", model: "mock/default:new" })).rejects.toThrow(/running/);
        expect(f.calls).toEqual([]);
        expect(f.live.model).toBe("mock/default:old");
        expect(f.model()).toBe("mock/default:old");
    });
}

test("setModel permits idle switch despite stale abortController", async () => {
    const f = fixture();
    const result = await setModel(f.ctx, null, { id: "a", model: "mock/default:new" });
    expect(result.changed).toEqual(["a"]);
    expect(f.model()).toBe("mock/default:new");
    expect(f.calls).toEqual(["update", "event", "unpark", "compact"]);
});

test("worker claim between preflight and update cannot mutate live model or unpark", async () => {
    const f = fixture(); f.race();
    await expect(setModel(f.ctx, null, { id: "a", model: "mock/default:new" })).rejects.toThrow(/running|changed/);
    expect(f.calls).toEqual(["update"]);
    expect(f.live.model).toBe("mock/default:old");
    expect(f.model()).toBe("mock/default:old");
});
test("same model is a no-op even while running", async () => {
    const f = fixture(); f.state("running"); f.live.activeRunCount = 1;
    expect((await setModel(f.ctx, null, { id: "a", model: "mock/default:old" })).changed).toEqual([]);
    expect(f.calls).toEqual([]);
});

test("provider scope preflights every target before the first mutation", async () => {
    const f = fixture();
    f.ctx.fns.procs.db.select = async ({ sql, params }: any) => {
        if (!sql.includes("WHERE id")) return [{ id: "a", model: "mock/default:old" }, { id: "b", model: "mock/default:old" }];
        return [{ id: params[0], model: "mock/default:old", run_state: params[0] === "b" ? "running" : "idle", scratchpad: JSON.stringify({ parked: { provider: "mock", account: "default" } }) }];
    };
    await expect(setModel(f.ctx, null, { id: "a", model: "mock/default:new", scope: "provider" })).rejects.toThrow(/running/);
    expect(f.calls).toEqual([]);
    expect(f.live.model).toBe("mock/default:old");
});

test("another model switch between preflight and CAS is not overwritten", async () => {
    const f = fixture();
    f.ctx.fns.procs.db.run = async ({ sql, params }: any) => {
        f.calls.push("update");
        expect(sql.includes("model IS NOT DISTINCT FROM ?")).toBe(true);
        expect(params[4]).toBe("mock/default:old");
        return { changes: 0 };
    };
    await expect(setModel(f.ctx, null, { id: "a", model: "mock/default:new" })).rejects.toThrow(/changed/);
    expect(f.calls).toEqual(["update"]);
    expect(f.live.model).toBe("mock/default:old");
});


test("a manual effort edit between preflight and CAS is not overwritten by the route's auto reset", async () => {
    const f = fixture();
    let storedEffort = "high";
    f.ctx.fns.procs.db.select = async ({ sql }: any) => sql.includes("WHERE id") ? [{ id: "a", model: f.model(), run_state: "idle", scratchpad: "{}", reasoning_effort: storedEffort }] : [];
    f.ctx.fns.models.listModels = async () => ({ models: [], source: "manual", cachedAt: null });
    f.ctx.fns.procs.db.run = async ({ sql, params }: any) => {
        f.calls.push("update");
        // The owner picked low after the switch read high: the pair guard rejects the stale write.
        storedEffort = "low";
        expect(sql).toContain("reasoning_effort = ?");
        expect(params.slice(0, 2)).toEqual(["mock/default:new", "auto"]);
        expect(params.at(-1)).toBe("high");
        return { changes: 0 };
    };
    await expect(setModel(f.ctx, null, { id: "a", model: "mock/default:new" })).rejects.toThrow(/changed/);
    expect(f.calls).toEqual(["update"]);
    expect(f.live.model).toBe("mock/default:old");
});

test("a failed unpark restores the previous pair only while the switch's pair is current", async () => {
    const f = fixture();
    f.live.reasoningEffort = "high";
    f.ctx.fns.procs.db.select = async ({ sql }: any) => sql.includes("WHERE id") ? [{ id: "a", model: "mock/default:old", run_state: "idle", scratchpad: "{}", reasoning_effort: "high" }] : [];
    const writes: any[] = [];
    f.ctx.fns.procs.db.run = async ({ sql, params }: any) => { writes.push({ sql, params }); return { changes: writes.length === 1 ? 1 : 0 }; };
    f.ctx.fns.agent.unpark = async () => { throw new Error("unpark failed"); };
    await expect(setModel(f.ctx, null, { id: "a", model: "mock/other:new" })).rejects.toThrow(/unpark failed/);
    expect(writes[0].params.slice(0, 2)).toEqual(["mock/other:new", "auto"]);
    // Rollback is guarded by the committed pair; a later edit (changes 0) keeps its own live state.
    expect(writes[1].sql).toContain("model IS NOT DISTINCT FROM ?");
    expect(writes[1].params).toEqual(["mock/default:old", "high", expect.any(Number), "a", "mock/other:new", "auto"]);
    expect([f.live.model, f.live.reasoningEffort]).toEqual(["mock/other:new", "auto"]);
});
