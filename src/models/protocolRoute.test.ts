import { beforeAll, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import route from "./inference/streamRoute";
import resolveReasoning from "./inference/resolveReasoning";
import load from "./$loader_modelProvider";
import inference from "./inference/stream";
let ctx: Context;
beforeAll(async () => { ctx = await mkTestCtx(); }, 60000);
const request: types.models.StreamRequest = {model: "m", sessionId: "s", instructions: "", messages: []};

test("route passes cached metadata, uses conn.fetch and provider headers override defaults", async () => {
    let called = false;
    const info = {id: "m", protocol: "anthropic"} as types.models.ModelInfo;
    const conn = {fetch: async (_url: string, init: RequestInit) => {
        called = true;
        expect(new Headers(init.headers).get("anthropic-version")).toBe("fixture-version");
        expect(new Headers(init.headers).get("accept")).toBe("text/event-stream");
        return new Response('event: message_stop\ndata: {"type":"message_stop"}\n\n', {headers: {"content-type": "text/event-stream"}});
    }} as types.models.ResolvedConnection;
    const definition = {id: "fixture", route: async (_ctx: Context, c: types.models.ResolvedConnection, o: {info: types.models.ModelInfo | null; sessionId: string}) => {
        expect(c).toBe(conn); expect(o.info).toBe(info); expect(o.sessionId).toBe("s");
        return {protocol: "anthropic", baseUrl: "https://example.test/v1", headers: {"Anthropic-Version": "fixture-version"}};
    }} as unknown as types.models.ProviderDefinition;
    await route(ctx, null, {definition, conn, req: request, info});
    expect(called).toBe(true);
});
test("invalid routes fail INVALID_INPUT without exposing header or URL secrets", async () => {
    for (const value of [
        {protocol: "unknown", baseUrl: "https://example.test", headers: {}},
        {protocol: "anthropic", baseUrl: "secret-fixture", headers: {}},
        {protocol: "anthropic", baseUrl: "https://example.test", headers: {authorization: "secret-fixture\ninvalid"}},
        {protocol: "anthropic", baseUrl: "https://example.test", headers: []},
    ]) {
        const definition = {id: "fixture", route: async () => value} as unknown as types.models.ProviderDefinition;
        try { await route(ctx, null, {definition, conn: {} as types.models.ResolvedConnection, req: request, info: null}); throw new Error("unexpected success"); }
        catch (error) { expect(error).toMatchObject({code: "INVALID_INPUT"}); expect(String(error)).not.toContain("secret-fixture"); }
    }
});
test("reasoning auto without default omits wire, concrete levels map and invalid metadata fails", () => {
    const metadata = {supported: ["off", "xhigh"], wire: {off: "none", xhigh: "max"}, disable: true} as types.models.ModelInfo["reasoning"];
    expect(resolveReasoning(ctx, null, {model: "m", metadata})).toMatchObject({applied: "auto"});
    expect(resolveReasoning(ctx, null, {model: "m", preference: "xhigh", metadata})).toMatchObject({applied: "xhigh", wire: "max"});
    expect(resolveReasoning(ctx, null, {model: "m", preference: "off", metadata})).toMatchObject({applied: "off", wire: "none", disable: true});
    expect(() => resolveReasoning(ctx, null, {model: "m", metadata: {...metadata!, wire: {low: "invalid"}}})).toThrow();
});
test("provider loader rejects stream plus route", async () => {
    const def = {id: "fixture", label: "Fixture", fields: [], transports: ["direct"], test: async () => ({}), stream: async () => ({}), route: async () => ({})};
    const entry = {root: "core", rootDir: "/fixture/src", abs: "/fixture/src/a/$modelProvider_fixture.ts", rel: "a/$modelProvider_fixture.ts", moduleDir: "a", name: "fixture", mod: {default: def}};
    const fake = {state: {models: {}, procs: {boot: {entries: [entry]}}}, fns: {procs: {modules: {list: () => [{name: "core", dir: "/fixture"}]}}}} as unknown as Context;
    await expect(load(fake, null, {entries: [entry as any]})).rejects.toThrow("route");
});
test("shared protocols place wire reasoning in native fields and auto sends none", async () => {
    for (const [protocol, field] of [["openaiChat", "reasoning_effort"], ["openaiResponses", "reasoning"], ["anthropic", "output_config"], ["gemini", "generationConfig"]] as const) {
        for (const applied of ["low", "auto", "off"] as const) {
            let body: Record<string, any> = {};
            const fetch = (async (_url: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response("", {status: 500}); }) as types.models.ResolvedConnection["fetch"];
            const reasoning = {requested: applied, applied, fallbackReason: null, source: "metadata", ...(applied === "low" ? {wire: "low"} : applied === "off" ? {wire: "none", disable: true} : {})} as types.models.ReasoningResolution;
            await ctx.fns.models.protocol[protocol].stream({fetch, endpoint: {base: "https://example.test/v1", headers: {}}, request: {...request, reasoning}}).catch(() => undefined);
            if (applied === "auto" || (applied === "off" && protocol === "gemini")) expect(body[field]).toBeUndefined();
            else if (applied === "off" && protocol === "anthropic") expect(body.thinking).toEqual({type: "disabled"});
            else expect(body[field]).toEqual(protocol === "openaiChat" ? (applied === "off" ? "none" : "low") : protocol === "gemini" ? {thinkingConfig: {thinkingLevel: "low"}} : {effort: applied === "off" ? "none" : "low"});
        }
    }
});

test("route inference gates disabled models and rejects invalid effort before route or transport", async () => {
    let routes = 0, resolutions = 0, disabled = true;
    const definition = {id: "fixture", capabilities: {reasoning: true}, route: async () => { routes++; return {}; }};
    const fake = {state: {models: {providers: {fixture: {definition}}}}, fns: {models: {
        inference: {assertModelEnabled: async () => { if (disabled) throw Object.assign(new Error("disabled"), {code: "MODEL_DISABLED_BY_USER"}); return {id: "c", provider: "fixture"}; }, checkInput: () => {}, failure: (o: {message: string; info: {code: string}}) => Object.assign(new Error(o.message), {code: o.info.code})},
        connections: {resolve: async () => { resolutions++; throw new Error("unexpected resolve"); }},
    }, procs: {db: {select: async () => [{models_cache: [{id: "m"}]}]}}}} as unknown as Context;
    await expect(inference(fake, null, {...request, connectionId: "c"})).rejects.toMatchObject({code: "MODEL_DISABLED_BY_USER"});
    disabled = false;
    await expect(inference(fake, null, {...request, connectionId: "c", reasoningEffort: "invalid" as types.models.ReasoningLevel})).rejects.toMatchObject({code: "INVALID_INPUT"});
    expect(routes).toBe(0); expect(resolutions).toBe(0);
});
