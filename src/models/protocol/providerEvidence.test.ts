import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../../_testCtx.entry";

let ctx: Context;
beforeAll(async () => { ctx = await mkTestCtx(); }, 120000);
const rejected = (p: Promise<unknown>) => p.then(() => { throw new Error("expected failure"); }, (e: any) => e);
const fallback = "No safe provider explanation available";

describe("HTTP evidence independent of classifier", () => {
    for (const behavior of ["absent", "null", "throw", "classified"]) {
        test(behavior, async () => {
            const err = await rejected(ctx.fns.models.protocol.common.streamFetch({
                fetch: async () => Response.json({ error: { message: "Capacity depleted" } }, { status: 503, headers: { "retry-after": "2" } }),
                url: "https://fixture.invalid", provider: "fixture", label: "Protocol", body: {}, headers: {},
                ...(behavior === "absent" ? {} : { classifyFailure: () => {
                    if (behavior === "throw") throw Error("private classifier exception");
                    return behavior === "null" ? null : { message: "private classifier text", classification: "provider" as const, code: "OVERRIDE", retryable: true };
                } }),
            }));
            expect(err.message).toBe("fixture · HTTP 503 · Capacity depleted");
            expect(err.failure).toMatchObject({ diagnostic: { summary: err.message, stage: "http", status: 503 }, retryAfterMs: 2000, retryable: true, acceptance: "rejected", replaySafe: true, code: behavior === "classified" ? "OVERRIDE" : "PROVIDER_UNAVAILABLE" });
        });
    }
    for (const [kind, content] of [["empty", null], ["plain", "not JSON"], ["oversize", JSON.stringify({ padding: "x".repeat(16384), error: { message: "Invisible suffix" } })]] as const) {
        test(kind, async () => {
            const err = await rejected(ctx.fns.models.protocol.common.streamFetch({ fetch: async () => new Response(content, { status: 400 }), url: "https://fixture.invalid", provider: "fixture", label: "Protocol", body: {}, headers: {} }));
            expect(err.message).toBe("fixture · HTTP 400 · " + fallback);
            expect(err.failure).toMatchObject({ diagnostic: { status: 400 }, retryable: false, code: "INVALID_INPUT" });
        });
    }
});

const detail = { message: "Capacity depleted" };
const formats = [
    ["gemini", { error: detail }, { candidates: [{ content: { parts: [{ text: "partial" }] } }] }],
    ["anthropic", { type: "error", error: detail }, { type: "content_block_delta", delta: { type: "text_delta", text: "partial" } }],
    ["openai-chat", { error: detail }, { choices: [{ delta: { content: "partial" } }] }],
    ["openai-responses", { type: "response.failed", response: { error: detail } }, { type: "response.output_text.delta", delta: "partial" }],
] as const;
const frame = (v: unknown) => "data: " + JSON.stringify(v) + "\n\n";
for (const [id, error, delta] of formats) {
    for (const mode of ["before", "after", "malformed", "ended"]) {
        test(id + " " + mode, async () => {
            const deltas: string[] = [];
            const payload = (mode === "before" ? "" : frame(delta)) + (mode === "ended" ? "" : mode === "malformed" ? "data: {broken\n\n" : frame(error));
            const err = await rejected(ctx.fns.models.protocol.get({ id }).stream(ctx, {
                fetch: async () => new Response(payload), endpoint: { base: "https://fixture.invalid", provider: "fixture", headers: {} },
                request: { model: "mock", sessionId: "sid", instructions: "", messages: [], onEvent(ev) { if (ev.type === "text_delta") deltas.push(ev.delta); } },
            }));
            const reported = mode === "before" || mode === "after";
            expect(deltas).toEqual(mode === "before" ? [] : ["partial"]);
            expect(err.failure).toMatchObject({ code: reported ? "PROVIDER_ERROR" : "STREAM_INTERRUPTED", classification: reported ? "provider" : "transport", acceptance: "uncertain", retryable: !reported, replaySafe: true });
            expect(err.failure.upstreamStatus).toBeUndefined();
            expect(err.failure.diagnostic.status).toBeUndefined();
            expect(err.message).toBe("fixture · stream · " + (reported ? detail.message : fallback));
            expect(err.failure.diagnostic.summary).toBe(err.message);
        });
    }
}
