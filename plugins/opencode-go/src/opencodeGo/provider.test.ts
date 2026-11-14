import { expect, test } from "bun:test";
import mapModel from "./mapModel";
import headers from "./headers";
import route from "./route";
import listModels from "./listModels";
import readUsage from "./readUsage";
import usage from "./usage";
import check from "./test";

function fixture(payload: unknown, status = 200, key = "secret-fixture") {
    const calls: {url: string; init?: RequestInit}[] = [];
    const conn = { secret: async () => key, fetch: async (url: string, init?: RequestInit) => {
        calls.push({url, init}); return Response.json(payload, {status});
    }} as unknown as types.models.ResolvedConnection;
    const ctx = { fns: {opencodeGo: {}} } as unknown as Context;
    Object.assign(ctx.fns.opencodeGo, {
        headers: (o: Parameters<typeof headers>[2]) => headers(ctx, null, o),
        mapModel: (o: Parameters<typeof mapModel>[2]) => mapModel(ctx, null, o),
        readUsage: (o: Parameters<typeof readUsage>[2]) => readUsage(ctx, null, o),
    });
    return {ctx, conn, calls};
}
const model = {id: "model", type: "chat", api: {messages: {}}, capabilities: {tools: {supported: true}, reasoning: {supported: true, effort: ["none", "low", "max"], toggle: true}}};
const window = {percent: 12, status: "ok", resetsAt: "2030-01-01T00:00:00Z"};
const payload = {usage: {rolling: window, weekly: {...window, status: "rate-limited"}, monthly: window}};
test("discovery maps protocols, optional defaults and wire values; rejects non tool models", async () => {
    const {ctx, conn} = fixture({data: [model, model, null, {id: "image", type: "image"}]});
    const result = await listModels(ctx, null, {conn});
    expect(result).toEqual([{id: "model", protocol: "anthropic", reasoning: {supported: ["off", "low", "xhigh"], wire: {off: "none", xhigh: "max"}, disable: true}}]);
    expect(JSON.stringify(result)).not.toContain("secret-fixture");
    for (const [api, protocol] of [["responses", "openai-responses"], ["generate-content", "gemini"], ["chat-completions", "openai-chat"]]) {
        expect(mapModel(ctx, null, {raw: {...model, api: {[api!]: {}}}})?.protocol).toBe(protocol);
    }
});
test("routing stays on Go, selects native endpoints and passes session/auth", async () => {
    const {ctx, conn, calls} = fixture(null);
    for (const [protocol, suffix] of [["anthropic", "/anthropic/v1"], ["gemini", "/google/v1beta"], ["openai-responses", "/openai/v1"], ["openai-chat", "/openai/v1"]] as const) {
        const r = await route(ctx, null, {conn, model: "m", info: {id: "m", protocol}, sessionId: "s"});
        expect(r.baseUrl).toBe("https://opencode.ai/inference/go" + suffix);
        expect(r.headers).toMatchObject({authorization: "Bearer secret-fixture", "x-opencode-session": "s"});
    }
    expect((await route(ctx, null, {conn, model: "m", info: null, sessionId: "s"})).protocol).toBe("openai-chat");
    expect(calls).toHaveLength(0);
});
test("usage validates all windows and test statuses never expose credentials or upstream bodies", async () => {
    const {ctx, conn} = fixture(payload);
    expect(await usage(ctx, null, {conn})).toMatchObject({status: "available", windows: [{label: "5h", usedPercent: 12}, {label: "Weekly", usedPercent: 100}, {label: "Monthly", usedPercent: 12}]});
    expect(await check(ctx, null, {conn})).toMatchObject({status: "available", reason: "usage-ok"});
    for (const status of [401, 403, 500]) {
        const f = fixture({error: "secret-fixture"}, status);
        const result = await check(f.ctx, null, {conn: f.conn});
        expect(result.reason).toBe(status === 500 ? "request-failed" : "unauthorized");
        expect(JSON.stringify(result)).not.toContain("secret-fixture");
    }
    const bad = fixture({usage: {rolling: window}});
    expect(await usage(bad.ctx, null, {conn: bad.conn})).toMatchObject({status: "unavailable"});
    const missing = fixture(null, 200, "");
    expect(await check(missing.ctx, null, {conn: missing.conn})).toMatchObject({reason: "key-required"});
    expect(missing.calls).toHaveLength(0);
});
