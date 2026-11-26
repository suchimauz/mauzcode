import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import { ACCESS, sse, text, world, wrap } from "./fixtures/antigravityWorld.entry";

beforeAll(async () => { await mkTestCtx(); }, 60000);

const ask = (ctx: Context, id: string, model: string, reasoningEffort?: string, extra: Record<string, unknown> = {}) =>
    ctx.fns.models.stream({ connectionId: id, model, instructions: "", sessionId: "s", messages: [{ role: "user", content: "hi" }], ...(reasoningEffort ? { reasoningEffort } : {}), ...extra });
/** No thinking option of any shape may accompany a variant member. */
const noThinking = (body: any) => { expect(JSON.stringify(body)).not.toMatch(/thinking|reasoning|effort/i); };

describe("variant resolution in models.stream (3.1)", () => {
    test("each preference names one advertised native member and sends no thinking option", async () => {
        const w = await world({ stream: () => text("ok") });
        const c = await w.connect("variants");
        const cases: [string, string | undefined, string, string, string][] = [
            ["gemini-4-neon", "xhigh", "gemini-4-neon-xhigh", "xhigh", "xhigh"],
            // Saved level above the group's range: the SDK nearest-level rule, with a reason.
            ["gemini-3.8-flash", "xhigh", "gemini-3.8-flash-high", "xhigh", "high"],
            // No off member: the lowest level, never a thinking-disable field.
            ["gemini-3.8-flash", "off", "gemini-3.8-flash-low", "off", "low"],
            // Auto: the declared default member of this group…
            ["gemini-4-neon", undefined, "gemini-4-neon-high", "auto", "high"],
            ["gemini-4-neon", "auto", "gemini-4-neon-high", "auto", "high"],
            // …and where the response default belongs to another group, the first eligible member in provider order.
            ["gemini-3.8-flash", "auto", "gemini-3.8-flash-high", "auto", "high"],
            ["claude-opus-5-5", undefined, "claude-opus-5-5-low", "auto", "low"],
            ["claude-opus-5-5", "max", "claude-opus-5-5-high", "max", "high"],
        ];
        for (const [model, effort, member, requested, applied] of cases) {
            const n = w.gens().length;
            const r = await ask(w.ctx, c.id, model, effort);
            expect(w.gens().length).toBe(n + 1);
            const body = w.gens()[n]!.body;
            expect([model, effort, body.model]).toEqual([model, effort, member]);
            noThinking(body);
            expect(r.reasoning).toMatchObject({ requested, applied, source: "metadata" });
            expect(r.reasoning!.fallbackReason === null).toBe(requested === applied || requested === "auto");
        }
        expect((await ask(w.ctx, c.id, "gemini-3.8-flash", "xhigh")).reasoning!.fallbackReason).toBe("xhigh is unsupported by gemini-3.8-flash; using high");
        // A standalone model sends its own id and still no invented level.
        await ask(w.ctx, c.id, "gemini-3-pro-high", "high");
        expect(w.gens().at(-1)!.body.model).toBe("gemini-3-pro-high");
        noThinking(w.gens().at(-1)!.body);
    });

    test("another variant provider without group-level availability never sends a disabled member", async () => {
        const w = await world({ stream: () => text("ok") });
        // Same SDK variant path, but without group-level availability member disables filter levels.
        const reg = w.ctx.state.models!.providers!.antigravity!;
        reg.definition = { ...reg.definition, capabilities: { ...reg.definition.capabilities, groupAvailability: false } };
        const c = await w.connect("per-member");
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-4-neon-high", enabled: false });
        const r = await ask(w.ctx, c.id, "gemini-4-neon", "high");
        expect(w.gens().at(-1)!.body.model).toBe("gemini-4-neon-medium");
        expect(r.reasoning).toMatchObject({ requested: "high", applied: "medium", fallbackReason: "high is unsupported by gemini-4-neon; using medium" });
        // The disabled default no longer serves auto either.
        await ask(w.ctx, c.id, "gemini-4-neon");
        expect(w.gens().at(-1)!.body.model).toBe("gemini-4-neon-xhigh");
        for (const s of ["xhigh", "medium", "low"]) await w.ctx.fns.models.setModelEnabled({ id: c.id, model: `gemini-4-neon-${s}`, enabled: false });
        const err = await ask(w.ctx, c.id, "gemini-4-neon", "high").then(() => null, (e: any) => e);
        expect(err.failure).toMatchObject({ code: "MODEL_UNAVAILABLE" });
    });

    test("Antigravity: legacy member disables keep every level; a disabled group and absent routes fail before the transport", async () => {
        const w = await world({ stream: () => text("ok") });
        const c = await w.connect("disabled");
        const legacy = (ids: string[]) => w.ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET disabled_models=?::text[] WHERE id=?", params: [ids, c.id] });
        // An unconverted legacy flag on the high member: the group stays whole and high sends the exact high member.
        await legacy(["gemini-4-neon-high"]);
        const r = await ask(w.ctx, c.id, "gemini-4-neon", "high");
        expect(w.gens().at(-1)!.body.model).toBe("gemini-4-neon-high");
        expect(r.reasoning).toMatchObject({ requested: "high", applied: "high", fallbackReason: null });
        noThinking(w.gens().at(-1)!.body);
        // Auto keeps the declared default member.
        await ask(w.ctx, c.id, "gemini-4-neon");
        expect(w.gens().at(-1)!.body.model).toBe("gemini-4-neon-high");
        // Every eligible member disabled: the whole group is off by the owner.
        await legacy(["gemini-4-neon-high", "gemini-4-neon-xhigh", "gemini-4-neon-medium", "gemini-4-neon-low"]);
        expect(await ask(w.ctx, c.id, "gemini-4-neon", "high").then(() => null, (e: any) => e.code)).toBe("MODEL_DISABLED_BY_USER");
        // An explicit group disable behaves the same.
        await legacy([]);
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-4-neon", enabled: false });
        expect((await w.ctx.fns.models.get({ id: c.id })).disabledModels).toEqual(["gemini-4-neon"]);
        const n = w.calls.length;
        const saved = async () => (await w.ctx.fns.procs.db.select({ sql: "SELECT disabled_models FROM llm_connections WHERE id=?", params: [c.id] }))[0];
        const before = await saved();
        for (const [model, effort] of [["gemini-4-neon", "high"], ["gemini-4-neon", undefined], ["gemini-4-neon-xhigh", undefined], ["gemini-9-missing", "low"], ["claude-opus-5-5-high", undefined]] as const) {
            const err = await ask(w.ctx, c.id, model, effort).then(() => null, (e: any) => e);
            // The disabled group and its legacy member route keep the owner's code; everything else is the catalogue failure.
            if (model.startsWith("gemini-4-neon")) { expect(err.code).toBe("MODEL_DISABLED_BY_USER"); continue; }
            expect(err.failure).toEqual({ code: "MODEL_UNAVAILABLE", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true });
            expect(err.message).toContain(c.route(model));
        }
        expect(w.calls.length).toBe(n);
        expect(await saved()).toEqual(before);
    });

    test("retries of one call keep the member the first attempt resolved", async () => {
        let cached: any[] = [];
        const w = await world({ stream: async (_call, n) => {
            if (n > 1) return text("ok");
            // The catalogue default moves between attempts; the request stays pinned to its still-eligible member.
            cached.find(m => m.id === "gemini-4-neon").reasoning.variants.default = "gemini-4-neon-low";
            await w.ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET models_cache=?::jsonb WHERE id=?", params: [JSON.stringify(cached), id] });
            return new Response("{}", { status: 503 });
        } });
        const c = await w.connect("pin");
        const id = c.id;
        const row = (await w.ctx.fns.procs.db.select({ sql: "SELECT models_cache FROM llm_connections WHERE id=?", params: [id] }))[0]!.models_cache;
        cached = typeof row === "string" ? JSON.parse(row) : row;
        const r = await w.ctx.fns.models.call({ connectionId: id, model: "gemini-4-neon", user: "hi", timeoutMs: 30000 });
        expect(r.attempts).toBe(2);
        expect(w.gens().map(g => g.body.model)).toEqual(["gemini-4-neon-high", "gemini-4-neon-high"]);
        // A new call follows the current catalogue.
        await w.ctx.fns.models.call({ connectionId: id, model: "gemini-4-neon", user: "hi", timeoutMs: 30000 });
        expect(w.gens().at(-1)!.body.model).toBe("gemini-4-neon-low");
    });

    test("providers without variants keep their model, preference and resolved level", async () => {
        const w = await world();
        const seen: types.models.StreamRequest[] = [];
        w.ctx.state.models!.providers!.plainfix = { owner: "core", module: "models", rel: "models/$modelProvider_plainfix.ts", definition: {
            id: "plainfix", label: "Plain", fields: [], transports: ["direct"], capabilities: { reasoning: true },
            test: async () => ({ status: "available", reason: "ok", message: "ok", checkedAt: 1 }),
            reasoningProfile: () => ({ supported: ["low", "high"], default: "low", source: "profile", profile: "fixture-1" }),
            stream: async (_ctx: Context, _conn: types.models.ResolvedConnection, req: types.models.StreamRequest) => { seen.push(req); return { text: "ok", thinking: "", finishReason: "stop", usage: {}, toolCalls: [] }; },
        } };
        const view = await w.ctx.fns.models.create({ provider: "plainfix", accountName: "p", config: {}, secrets: {}, transport: { kind: "direct" } });
        // A cold cache and an unknown model are still this provider's own business.
        const r = await ask(w.ctx, view.id, "anything", "xhigh");
        expect(seen[0]).toMatchObject({ model: "anything", reasoningEffort: "xhigh", reasoning: { requested: "xhigh", applied: "high", source: "profile" } });
        expect(r.reasoning).toMatchObject({ requested: "xhigh", applied: "high" });
    });

    test("delegation validates explicit levels against the same variant levels and creates no child on rejection", async () => {
        const w = await world();
        const c = await w.connect("delegate");
        const pick = (model?: string, reasoningEffort?: any, parentModel?: string) => w.ctx.fns.agent.resolveChildModel({ ...(model ? { model } : {}), ...(reasoningEffort ? { reasoningEffort } : {}), ...(parentModel ? { parentModel } : {}) });
        const listed = (await w.ctx.fns.tools.listModels({ provider: "antigravity" })).models;
        expect(listed.find((m: any) => m.route === c.route("gemini-3.8-flash"))!.reasoning).toEqual(["high", "medium", "low"]);
        expect(await pick(c.route("gemini-4-neon"), "xhigh")).toEqual({ model: c.route("gemini-4-neon"), reasoningEffort: "xhigh" });
        expect(await pick(c.route("gemini-3.8-flash"))).toEqual({ model: c.route("gemini-3.8-flash"), reasoningEffort: "auto" });
        await expect(pick(c.route("gemini-3.8-flash"), "xhigh")).rejects.toThrow(/does not support reasoning effort xhigh/);
        await expect(pick(c.route("gemini-3-flash"), "low")).rejects.toThrow(/does not support reasoning effort low/);
        // An inherited group route is checked the same way; a member route is not a selectable model.
        await expect(pick(undefined, "minimal", c.route("gemini-3.8-flash"))).rejects.toThrow(/does not support reasoning effort minimal/);
        expect(await pick(undefined, "medium", c.route("gemini-3.8-flash"))).toEqual({ model: c.route("gemini-3.8-flash"), reasoningEffort: "medium" });
        await expect(pick(c.route("gemini-4-neon-xhigh"))).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
        // A legacy member flag removes no level: delegation sees the same whole group as the picker; a member edit is refused.
        await w.ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET disabled_models=?::text[] WHERE id=?", params: [["gemini-4-neon-xhigh"], c.id] });
        expect(await pick(c.route("gemini-4-neon"), "xhigh")).toEqual({ model: c.route("gemini-4-neon"), reasoningEffort: "xhigh" });
        await expect(w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-4-neon-xhigh", enabled: false })).rejects.toMatchObject({ code: "VALIDATION", group: "gemini-4-neon" });
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-4-neon", enabled: false });
        await expect(pick(c.route("gemini-4-neon"), "xhigh")).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-4-neon", enabled: true });

        const parent = await w.ctx.fns.agent.start({ model: c.route("gemini-4-neon") });
        const count = async () => Number((await w.ctx.fns.procs.db.select({ sql: "SELECT count(*)::int AS n FROM agents", params: [] }))[0]!.n);
        const n = await count();
        await expect(w.ctx.fns.agent.delegate({ agent: parent, title: "child", tasks: [{ id: "a", title: "A" }], model: c.route("gemini-3.8-flash"), reasoningEffort: "xhigh" })).rejects.toThrow(/does not support reasoning effort xhigh/);
        expect(await count()).toBe(n);
        expect(w.gens().length).toBe(0);
    });
});

describe("Antigravity protocol fixtures for both families (3.2)", () => {
    const tools = [{ name: "read", description: "Read", parameters: { type: "object", properties: {} } }];
    const usage = { promptTokenCount: 7, candidatesTokenCount: 2, thoughtsTokenCount: 3 };

    test("Gemini: exact member, project envelope, incremental text, usage and signed tool continuation", async () => {
        const w = await world({ stream: (_c, n) => n === 1
            ? sse([wrap({ candidates: [{ content: { parts: [{ text: "Hel" }] } }] }), wrap({ candidates: [{ content: { parts: [{ text: "lo" }] }, finishReason: "STOP" }], usageMetadata: usage })])
            : n === 2 ? sse([wrap({ candidates: [{ content: { parts: [
                { functionCall: { name: "read", args: { path: "a" } }, thoughtSignature: "sig-A" }, { functionCall: { name: "read", args: { path: "b" } }, thoughtSignature: "sig-B" }] }, finishReason: "STOP" }] })])
            : text("done", usage) });
        const c = await w.connect("gemini");
        const deltas: string[] = [];
        const base = { connectionId: c.id, model: "gemini-4-neon", reasoningEffort: "xhigh", instructions: "Be brief", sessionId: "sess-1", tools };
        const first = await w.ctx.fns.models.stream({ ...base, messages: [{ role: "user", content: "hi" }], onEvent: (e: types.models.StreamEvent) => { if (e.type === "text_delta") deltas.push(e.delta); } });
        expect(deltas).toEqual(["Hel", "lo"]);
        expect(first).toMatchObject({ text: "Hello", finishReason: "stop", usage: { prompt_tokens: 7, completion_tokens: 5 } });
        const g = w.gens()[0]!;
        expect(g.headers.authorization).toBe("Bearer " + ACCESS);
        expect(g.body).toMatchObject({ project: "proj-cess", model: "gemini-4-neon-xhigh", requestType: "agent", userAgent: "antigravity" });
        expect(g.body.request).toMatchObject({ sessionId: "sess-1", systemInstruction: { parts: [{ text: "Be brief" }] }, contents: [{ role: "user", parts: [{ text: "hi" }] }], tools: [{ functionDeclarations: [{ name: "read" }] }] });
        noThinking(g.body.request.generationConfig ?? {});
        const called = await w.ctx.fns.models.stream({ ...base, messages: [{ role: "user", content: "go" }] });
        expect(called.finishReason).toBe("tool_calls");
        const second = await w.ctx.fns.models.stream({ ...base, messages: [{ role: "user", content: "go" }, { role: "assistant", content: "", tool_calls: called.toolCalls },
            ...called.toolCalls.map((t: any, i: number) => ({ role: "tool", tool_call_id: t.id, content: "result-" + i }))] });
        expect(second).toMatchObject({ text: "done", usage: { prompt_tokens: 7, completion_tokens: 5 } });
        const next = w.gens()[2]!.body;
        expect(next.model).toBe("gemini-4-neon-xhigh");
        // Each call keeps its own signature; Gemini parts carry no invented call id.
        expect(next.request.contents[1]).toEqual({ role: "model", parts: [
            { functionCall: { name: "read", args: { path: "a" } }, thoughtSignature: "sig-A" }, { functionCall: { name: "read", args: { path: "b" } }, thoughtSignature: "sig-B" }] });
        expect(next.request.contents[2].parts.map((p: any) => p.functionResponse)).toEqual([{ name: "read", response: { output: "result-0" } }, { name: "read", response: { output: "result-1" } }]);
    });

    test("Claude: exact member on the same connection, tool call correlated by its id, continuation data and usage", async () => {
        const w = await world({ stream: (_c, n) => n === 1
            ? sse([wrap({ candidates: [{ content: { parts: [{ text: "Let me " }] } }] }), wrap({ candidates: [{ content: { parts: [{ text: "look." },
                { functionCall: { id: "toolu_01A", name: "read", args: { path: "a" } }, thoughtSignature: "claude-sig" }, { functionCall: { name: "read", args: { path: "b" } } }] }, finishReason: "STOP" }] })])
            : text("answer", usage) });
        const c = await w.connect("claude");
        // Discovery and a passing connection test are not inference evidence: nothing was generated yet.
        expect(await w.ctx.fns.models.test({ id: c.id })).toMatchObject({ status: "available" });
        expect(w.gens().length).toBe(0);
        const base = { connectionId: c.id, model: "claude-opus-5-5", reasoningEffort: "medium", instructions: "", sessionId: "sess-2", tools };
        const deltas: string[] = [];
        const first = await w.ctx.fns.models.stream({ ...base, messages: [{ role: "user", content: "go" }], onEvent: (e: types.models.StreamEvent) => { if (e.type === "text_delta") deltas.push(e.delta); } });
        expect(deltas).toEqual(["Let me ", "look."]);
        expect(first.finishReason).toBe("tool_calls");
        expect(first.toolCalls[0]).toEqual({ id: "toolu_01A", name: "read", args: { path: "a" }, thoughtSignature: "claude-sig" });
        // A call the stream left without an id gets a unique one, not a per-response position.
        expect(first.toolCalls[1]!.id).toMatch(/^toolu_[0-9a-f]{32}$/);
        expect("thoughtSignature" in first.toolCalls[1]!).toBe(false);
        const second = await w.ctx.fns.models.stream({ ...base, messages: [{ role: "user", content: "go" }, { role: "assistant", content: "Let me look.", tool_calls: first.toolCalls },
            ...first.toolCalls.map((t: any, i: number) => ({ role: "tool", tool_call_id: t.id, content: "result-" + i }))] });
        expect(second).toMatchObject({ text: "answer", finishReason: "stop", usage: { prompt_tokens: 7, completion_tokens: 5 } });
        const [a, b] = w.gens().map(g => g.body);
        for (const body of [a, b]) {
            expect(body).toMatchObject({ project: "proj-cess", model: "claude-opus-5-5-medium", requestType: "agent", userAgent: "antigravity" });
            noThinking(body.request.generationConfig ?? {});
        }
        expect(w.gens().every(g => g.headers.authorization === "Bearer " + ACCESS)).toBe(true);
        const other = first.toolCalls[1]!.id;
        expect(b.request.contents[1]).toEqual({ role: "model", parts: [{ text: "Let me look." },
            { functionCall: { id: "toolu_01A", name: "read", args: { path: "a" } }, thoughtSignature: "claude-sig" }, { functionCall: { id: other, name: "read", args: { path: "b" } } }] });
        expect(b.request.contents[2].parts.map((p: any) => p.functionResponse)).toEqual([{ name: "read", id: "toolu_01A", response: { output: "result-0" } }, { name: "read", id: other, response: { output: "result-1" } }]);
    });

    test("a listed Claude model can still be refused at generation, and each account uses only its own grant and project", async () => {
        const w = await world({ stream: call => call.body.model.startsWith("claude") ? new Response(JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "not enabled" } }), { status: 403 }) : text("ok") });
        const a = await w.connect("acct-a");
        const b = await w.connect("acct-b", "ya29.SECRET-other");
        expect((await w.ctx.fns.models.listModels({ id: a.id, cacheOnly: true })).models.some((m: any) => m.id === "claude-opus-5-5")).toBe(true);
        const err = await ask(w.ctx, a.id, "claude-opus-5-5", "high").then(() => null, (e: any) => e);
        expect(err.failure).toMatchObject({ code: "ACCESS_DENIED", retryable: false });
        // One request, no substitute member, family or account.
        expect(w.gens().map(g => g.body.model)).toEqual(["claude-opus-5-5-high"]);
        await ask(w.ctx, b.id, "gemini-3.8-flash", "low");
        await ask(w.ctx, a.id, "gemini-3.8-flash", "low");
        expect(w.gens().slice(1).map(g => [g.headers.authorization, g.body.project, g.body.model])).toEqual([
            ["Bearer ya29.SECRET-other", "proj-ther", "gemini-3.8-flash-low"], ["Bearer " + ACCESS, "proj-cess", "gemini-3.8-flash-low"]]);
    });
});
