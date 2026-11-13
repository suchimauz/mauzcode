import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../../../_testCtx.entry";

let ctx: Context;
beforeAll(async () => { ctx = await mkTestCtx(); }, 120000);

function trackedResponse(body: string, status = 200) {
    const state = { cancelled: false };
    const stream = new ReadableStream({ pull(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); }, cancel() { state.cancelled = true; } });
    return { response: new Response(stream, { status }), state };
}

describe("models.protocol.common.normalizeBase", () => {
    test("accepts http(s) and trims trailing slashes", () => {
        expect(ctx.fns.models.protocol.common.normalizeBase({ raw: "https://api.example.com/v1///" })).toBe("https://api.example.com/v1");
        expect(ctx.fns.models.protocol.common.normalizeBase({ raw: "http://127.0.0.1:8080" })).toBe("http://127.0.0.1:8080");
    });
    for (const raw of ["not a url", "ftp://x.io", "https://u:p@x.io", "https://x.io/?a=1", "https://x.io/#f", "https://x.io/?", "https://x.io/#", "https://x.io/v1?#"]) {
        test("rejects " + JSON.stringify(raw) + " without echoing it", () => {
            expect(() => ctx.fns.models.protocol.common.normalizeBase({ raw })).toThrow(/^Invalid base URL$/);
        });
    }
});

describe("models.protocol.common.checkedFetch", () => {
    test("signal aborted before the request makes no fetch call", async () => {
        let calls = 0;
        const signal = AbortSignal.abort();
        await expect(ctx.fns.models.protocol.common.checkedFetch({ fetch: async () => { calls++; return new Response(""); }, url: "http://x", init: {}, what: "X", signal })).rejects.toThrow();
        expect(calls).toBe(0);
    });
    test("signal aborted after the response cancels the body", async () => {
        const ac = new AbortController();
        const t = trackedResponse("{}");
        await expect(ctx.fns.models.protocol.common.checkedFetch({ fetch: async (_u, init) => { expect(init?.signal).toBe(ac.signal); ac.abort(); return t.response; }, url: "http://x", init: {}, what: "X", signal: ac.signal })).rejects.toThrow();
        expect(t.state.cancelled).toBe(true);
    });
    test("HTTP failure cancels the body and exposes only the status", async () => {
        const t = trackedResponse("secret body text", 503);
        const err = await ctx.fns.models.protocol.common.checkedFetch({ fetch: async () => t.response, url: "http://x", init: {}, what: "Model discovery request" }).catch(e => e as Error);
        expect((err as Error).message).toBe("Model discovery request failed (HTTP 503)");
        expect(t.state.cancelled).toBe(true);
    });
    test("success returns the response unread", async () => {
        const r = await ctx.fns.models.protocol.common.checkedFetch({ fetch: async () => new Response("ok"), url: "http://x", init: {}, what: "X" });
        expect(await r.text()).toBe("ok");
    });
});

describe("models.protocol.common.openaiModels", () => {
    const parse = (body: string) => ctx.fns.models.protocol.common.openaiModels({ response: new Response(body) });
    test("de-duplicates and skips malformed elements in catalogue order", async () => {
        expect(await parse(JSON.stringify({ data: [null, 1, "x", { id: "" }, { id: 5 }, { id: "a" }, { id: "b" }, { id: "a" }] }))).toEqual([{ id: "a" }, { id: "b" }]);
    });
    for (const body of ["{not json SECRET-TEXT", "null", "{}", JSON.stringify({ data: {} }), "\"str\""]) {
        test("malformed catalogue " + JSON.stringify(body.slice(0, 12)) + " gives only Invalid model catalogue", async () => {
            const err = await parse(body).catch(e => e as Error);
            expect((err as Error).message).toBe("Invalid model catalogue");
        });
    }
    test("consumes the body", async () => {
        const response = new Response(JSON.stringify({ data: [] }));
        await ctx.fns.models.protocol.common.openaiModels({ response });
        expect(response.bodyUsed).toBe(true);
    });
});
