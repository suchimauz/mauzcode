import { describe, expect, test } from "bun:test";
import page from "./$route__GET";
import suggest from "./$route_suggest_POST";

const model = "custom/work:new/model:v2";
function fixture(text = " продолжение", failure?: Error) {
    const calls: types.models.CallRequest[] = [];
    const routes: string[] = [];
    const ctx = { fns: { auth: { verifyCsrf: async () => true }, models: {
        resolveRoute: async (opts: { route: string }) => {
            expect(opts).toEqual({ route: model }); routes.push(opts.route);
            if (failure) throw failure;
            return { connectionId: "connection", model: "new/model:v2", route: opts.route };
        },
        call: async (opts: types.models.CallRequest) => { calls.push(opts); return { text }; },
    } } } as any;
    return { ctx, calls, routes };
}
function request(input: object = {}) {
    return new Request("http://localhost/autotext/suggest", { method: "POST", body: JSON.stringify({ model, before: "Это статья", after: "", ...input }) });
}
describe("autotext stored model routes", () => {
    test("redirects to native utilities", async () => {
        const result = await page({} as any, null, { req: new Request("http://localhost/autotext"), params: {} });
        expect(result.status).toBe(302);
        expect(result.headers.get("Location")).toBe("/?view=extension:utilities/autotext");
    });
    test("accepts a new custom native model with a bounded neutral call and preserves whitespace", async () => {
        const { ctx, calls, routes } = fixture(); const req = request();
        const res = await suggest(ctx, null, { req });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ text: " продолжение", model, ms: expect.any(Number) });
        expect(routes).toEqual([model]);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ connectionId: "connection", model: "new/model:v2", timeoutMs: 15000, maxTokens: 300, reasoningEffort: "low", signal: req.signal });
        expect(calls[0]).not.toHaveProperty("noFallback");
    });
    for (const code of ["LEGACY_ROUTE", "CONNECTION_DISABLED", "MODEL_DISABLED_BY_USER"]) {
        test(`${code} returns the existing HTTP error without a model call`, async () => {
            const { ctx, calls, routes } = fixture("", new Error(code));
            const res = await suggest(ctx, null, { req: request() });
            expect(res.status).toBe(400);
            expect(await res.json()).toEqual({ error: "Suggestion unavailable or timed out" });
            expect(routes).toEqual([model]); expect(calls).toHaveLength(0);
        });
    }
    test("provider failure never selects an alternate model", async () => {
        const { ctx, calls, routes } = fixture();
        ctx.fns.models.call = async (opts: types.models.CallRequest) => { calls.push(opts); throw new Error("quota"); };
        expect((await suggest(ctx, null, { req: request() })).status).toBe(400);
        expect(calls).toHaveLength(1); expect(routes).toEqual([model]);
    });
    test("rewrite validates tail and structured output", async () => {
        const { ctx, calls } = fixture(JSON.stringify({ text: "Вторая фраза закончена." }));
        const input = { before: "Первая фраза. Сегонд фрза", rewrite: true, tail: "Сегонд фрза" };
        const res = await suggest(ctx, null, { req: request(input) });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ text: "Вторая фраза закончена.", replaceChars: input.tail.length });
        expect(calls[0]!.system).toContain("fixing spelling");
        expect((await suggest(ctx, null, { req: request({ ...input, tail: "другое" }) })).status).toBe(400);
        expect(calls).toHaveLength(1);
        ctx.fns.models.call = async () => ({ text: "not JSON" });
        expect((await suggest(ctx, null, { req: request(input) })).status).toBe(422);
    });
    test("CSRF and input bounds stop calls; NO_SUGGESTION is empty", async () => {
        const { ctx, calls } = fixture(" NO_SUGGESTION ");
        expect(await (await suggest(ctx, null, { req: request() })).json()).toMatchObject({ text: "" });
        for (const before of ["", "x".repeat(17000), "x".repeat(25000)]) {
            expect((await suggest(ctx, null, { req: request({ before }) })).status).toBeGreaterThanOrEqual(400);
        }
        ctx.fns.auth.verifyCsrf = async () => false;
        expect((await suggest(ctx, null, { req: request() })).status).toBe(403);
        expect(calls).toHaveLength(1);
    });
});
