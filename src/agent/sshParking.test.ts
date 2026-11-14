import { test, expect } from "bun:test";
import park from "./parkOnUsageLimit";
import setModel from "./setModel";


function fixture() {
    const rows = [
        { id: "a", model: "codex/ssh.alpha.main:gpt-test" },
        { id: "b", model: "codex/ssh.alpha.main:gpt-other" },
        { id: "c", model: "codex/ssh.beta.main:gpt-test" },
        { id: "d", model: "codex/main:gpt-test" },
        { id: "e", model: "claude/ssh.alpha.main:claude-test" },
    ];
    const ctx = { state: { agent: {} }, fns: {
        procs: { db: { select: async ({sql,params}: {sql: string; params?: unknown[]}) => sql.includes("WHERE id = ?") ? [{ ...rows.find(row => row.id === params?.[0]), run_state: "idle", scratchpad: JSON.stringify({ parked: { provider: "codex", account: "ssh.alpha.main" } }) }] : rows, run: async () => ({ changes: 1 }) } },
        models: { resolveRoute: async ({route}: {route:string}) => ({route, provider:route.split('/')[0],accountName:route.slice(route.indexOf('/')+1,route.indexOf(':')),connectionId:'connection',model:route.slice(route.indexOf(':')+1)}) },
        session: { mutateScratchpad: async ({mutate}: { mutate: (value: object) => void }) => { const scratchpad = {}; mutate(scratchpad); return { scratchpad }; }, appendEvent: async () => {}, load: async () => null },
        events: { refreshAgentMeta: () => {}, emitAgentsChanged: () => {} },
        ui: { notify: async () => {} }, agent: { unpark: async () => {} },
    } } as unknown as Context;
    return ctx;
}

test("canonical migrated SSH account parking matches only the exact connection prefix", async () => {
    const result = await park(fixture(), null, { originAgentId:'a', info: { code:'QUOTA_EXHAUSTED',classification:'quota',acceptance:'rejected',replaySafe:true,resetAt:999999,retryable:false }, now: 1 });
    expect(result.parked).toEqual(["a", "b"]);
});

test("canonical migrated SSH account group switching preserves connection identity", async () => {
    const result = await setModel(fixture(), null, { id: "a", model: "codex/ssh.beta.main:gpt-test", scope: "provider" });
    expect(result.changed).toEqual(["a", "b"]);
});
