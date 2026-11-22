import { expect, test } from "bun:test";
import answer from "./answer";
import fetchPage from "./fetch";

const model = "custom/work:new/model:v2";
const url = "https://example.test/page";
function fixture() {
    const calls: types.models.CallRequest[] = []; const routes: string[] = [];
    const ctx: any = { fns: {
        settings: { getString: async () => model, modelDefault: async () => { throw Error("unexpected default"); } },
        websearch: { requireAccess: async () => {}, search: async () => ({ results: [{ url, title: "Title" }] }), read: async () => ({ url, title: "Title", markdown: "The result is forty two.", truncated: false }) },
        models: {
            resolveRoute: async (o: { route: string }) => { expect(o).toEqual({ route: model }); routes.push(o.route); return { connectionId: "connection", model: "new/model:v2" }; },
            call: async (o: types.models.CallRequest) => { calls.push(o); return { text: JSON.stringify({ answer: "Forty two.", citations: [{ url, quote: "The result is forty two." }] }) }; },
        },
    } };
    return { ctx, calls, routes };
}
test("answer uses only models facade, retaining citations and original route", async () => {
    const { ctx, calls, routes } = fixture();
    const result = await answer(ctx, null, { question: "What is the result?", requireVerified: true });
    expect(result).toMatchObject({ answer: "Forty two.", model });
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({ url, quote: "The result is forty two.", verified: true });
    expect(routes).toEqual([model]);
    expect(calls[0]).toMatchObject({ connectionId: "connection", model: "new/model:v2", maxTokens: 4096 });
    expect(calls[0]!.user).toContain("The result is forty two.");
});
test("fetch retains markdown, truncation metadata and output limit", async () => {
    const { ctx, calls, routes } = fixture(); ctx.fns.models.call = async (o: types.models.CallRequest) => { calls.push(o); return { text: "Forty two." }; };
    expect(await fetchPage(ctx, null, { url, prompt: "result" })).toMatchObject({ result: "Forty two.", markdown: "The result is forty two.", truncated: false, model, url });
    expect(routes).toEqual([model]);
    expect(calls[0]).toMatchObject({ connectionId: "connection", model: "new/model:v2", maxTokens: 2048 });
    expect(await fetchPage(ctx, null, { url, prompt: "result", includeMarkdown: false })).toMatchObject({ markdown: null });
});
for (const phase of ["resolution", "provider"] as const) {
    test(`${phase} error propagates unchanged from answer/fetch with no model fallback`, async () => {
        const { ctx, calls, routes } = fixture(); const error = new Error(phase === "resolution" ? "LEGACY_ROUTE" : "quota exhausted");
        if (phase === "resolution") ctx.fns.models.resolveRoute = async (o: { route: string }) => { expect(o).toEqual({ route: model }); routes.push(o.route); throw error; };
        else ctx.fns.models.call = async (o: types.models.CallRequest) => { calls.push(o); throw error; };
        await expect(answer(ctx, null, { question: "result" })).rejects.toBe(error);
        await expect(fetchPage(ctx, null, { url, prompt: "result" })).rejects.toBe(error);
        expect(routes).toEqual([model, model]); expect(calls).toHaveLength(phase === "resolution" ? 0 : 2);
    });
}
