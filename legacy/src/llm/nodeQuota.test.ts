import { test, expect } from "bun:test";
import resolve from "./resolveEndpoint";

import park from "../agent/parkOnUsageLimit";
import setModel from "../agent/setModel";
import parseModelRouteFn from "./parseModelRoute";

const catalog = ["a", "b"].map(account => ({ id: `codex/${account}:gpt-test`, provider: "codex", account, api: "responses", kind: "subscription" }));
function fixture(entries = catalog) {
    const rows = [
        { id: "a1", model: "mauzcode/mini6:codex/a:gpt-test" },
        { id: "a2", model: "mauzcode/mini6:codex/a:other" },
        { id: "b", model: "mauzcode/mini6:codex/b:gpt-test" },
        { id: "legacy", model: "mauzcode/mini6:gpt-test" },
        { id: "local", model: "codex/a:gpt-test" },
        { id: "other", model: "mauzcode/other:codex/a:gpt-test" },
    ];
    const ctx: any = { state: { agent: {} }, fns: {
        node: { get: async () => ({ enabled: true, url: "https://node.test", catalog: entries }), token: async () => "fake" },
        procs: { db: { select: async () => rows, run: async () => ({ changes: 1 }) } },
        session: { mutateScratchpad: async ({mutate}: any) => { const scratchpad = {}; mutate(scratchpad); return {scratchpad}; }, appendEvent: async () => {} },
        events: { refreshAgentMeta: () => {} }, ui: { notify: async () => {} },
        llm: { parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o), recordUsage: async () => {} },
    } };
    return {ctx, rows};
}

test("node endpoint keeps transport identity and separates upstream quota", async () => {
    const {ctx} = fixture();
    const a = await resolve(ctx, null, { model: "mauzcode/mini6:codex/a:gpt-test" });
    const b = await resolve(ctx, null, { model: "mauzcode/mini6:codex/b:gpt-test" });
    expect(a.account).toBe("mini6");
    expect(a.modelId).toBe("codex/a:gpt-test");
    expect(a.quotaAccount).toBe("mini6/codex/a");
    expect(b.quotaAccount).toBe("mini6/codex/b");
});

test("legacy bare route upgrades only when unique", async () => {
    const {ctx} = fixture([catalog[0]!]);
    const a = await resolve(ctx, null, { model: "mauzcode/mini6:gpt-test" });
    expect(a.modelId).toBe("codex/a:gpt-test");
    expect(a.quotaAccount).toBe("mini6/codex/a");
    await expect(resolve(fixture().ctx, null, { model: "mauzcode/mini6:gpt-test" })).rejects.toThrow("ambiguous");
});

function canonicalFixture() {
    const {ctx,rows}=fixture();
    rows.forEach(row=>{row.model = row.id === 'a1' ? 'custom/mini6 a:codex/a:gpt-test' : row.id === 'a2' ? 'custom/mini6 a:codex/a:other' : `custom/${row.id}:native`;});
    ctx.fns.models={resolveRoute:async({route}:any)=>({route,provider:'custom',accountName:route.slice(7,route.indexOf(':')),connectionId:'connection',model:route.slice(route.indexOf(':')+1)})};
    ctx.fns.procs.db.select=async({sql,params}:any)=>sql.includes('WHERE id = ?')?rows.filter(r=>r.id===params[0]):rows;
    return {ctx,rows};
}
const quota:types.models.FailureInfo={code:'QUOTA_EXHAUSTED',classification:'quota',acceptance:'rejected',retryable:false,replaySafe:true};
test("canonical gateway quota isolates exact connection without interpreting native suffix", async () => {
    const {ctx}=canonicalFixture();
    const result=await park(ctx,null,{info:quota,originAgentId:'a1',now:1000});
    expect(result.parked).toEqual(['a1','a2']);
});

test('non-quota SDK failure never parks other accounts',async()=>{
 const {ctx}=canonicalFixture();
 await expect(park(ctx,null,{info:{...quota,code:'RATE_LIMITED',classification:'throttled'},originAgentId:'a1'})).rejects.toThrow('QUOTA_EXHAUSTED');
});

test("manual provider-scope switch respects upstream quota identity", async () => {
    const {ctx, rows} = canonicalFixture();
    const changed: string[] = [];
    ctx.fns.llm.resolveEndpoint = async () => ({apiKey: "fake", provider: "mauzcode", account: "mini6", kind: "subscription"});
    ctx.fns.procs.db.select = async ({sql, params}: any) => sql.includes("scratchpad")
        ? [{ ...rows[0], scratchpad: JSON.stringify({parked: {provider: "custom", account: "mini6 a"}}) }]
        : sql.includes("WHERE id = ?") ? rows.filter(r => r.id === params[0]) : rows;
    ctx.fns.agent = {unpark: async ({id}: any) => { changed.push(id); }};
    ctx.fns.session.load = async () => null;
    ctx.fns.events.emitAgentsChanged = () => {};
    const result = await setModel(ctx, null, {id: "a1", model: "custom/mini6 b:codex/b:gpt-test", scope: "provider"});
    expect(result.changed).toEqual(["a1", "a2"]);
    expect(changed).toEqual(["a1", "a2"]);
});
