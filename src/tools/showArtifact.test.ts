// FUNCTIONAL test: native show_artifact on a real test database and the real canvas file kind.
import { afterAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { mkTestCtx } from "../_testCtx.entry";

const TEST_DIR = ".test-tmp/show-artifact";
const ABS_DIR = resolve(TEST_DIR);

afterAll(async () => { await Bun.$`rm -rf ${TEST_DIR}`.quiet(); });

const snapshot = (allow: string[], deny: string[] = []): types.agentPreset.Snapshot =>
    ({ presetId: "test", name: "TestPreset", layers: [{ id: "test", allow, deny, plugins: [], prompt: "", excludeSections: [] }] });

async function setup(preset?: types.agentPreset.Snapshot) {
    const ctx: any = await mkTestCtx();
    await ctx.fns.files.write({ path: `${TEST_DIR}/report.md`, content: "# Report\n" });
    await ctx.fns.files.mkdir({ path: `${TEST_DIR}/sub` });
    const agent = await ctx.fns.agent.start({ model: "test:model", systemPrompt: "", workspaceDir: ABS_DIR });
    agent.preset = preset ?? snapshot(["*"]);
    await ctx.fns.session.save({ agent });
    const call = (args: unknown, who = agent) => ctx.fns.tools.call({ name: "show_artifact", args, agent: who });
    const tabs = (id = agent.id) => ctx.fns.canvas.list({ agentId: id });
    return { ctx, agent, call, tabs };
}

describe("show_artifact", () => {
    test("shows a workspace file as the active tab and returns the compact receipt", async () => {
        const { ctx, agent, call, tabs } = await setup();
        const result = await call({ path: "report.md" });
        expect(result.isError).toBe(false);
        const out = JSON.parse(result.output);
        expect(out).toEqual({ itemId: expect.any(Number), title: "report.md", path: `${ABS_DIR}/report.md`, host: "local" });
        expect(await ctx.fns.canvas.get({ agentId: agent.id })).toMatchObject({ open: true, activeItemId: out.itemId });
        const list = await tabs();
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ id: out.itemId, kind: "file", active: true });
        expect(list[0].args).toMatchObject({ path: `${ABS_DIR}/report.md`, host: "local", mode: "auto" });
    });

    test("showing the same file again reuses the tab; title and mode pass through", async () => {
        const { call, tabs } = await setup();
        const first = JSON.parse((await call({ path: "report.md", title: "Quarterly report", mode: "source" })).output);
        expect(first.title).toBe("Quarterly report");
        expect((await tabs())[0].args).toMatchObject({ mode: "source", tab: "code" });
        // Deduplication keys on the pinned args, so the repeat passes the same mode.
        const second = JSON.parse((await call({ path: "report.md", mode: "source" })).output);
        expect(second.itemId).toBe(first.itemId);
        expect(await tabs()).toHaveLength(1);
    });

    test("a missing file fails without creating a tab", async () => {
        const { ctx, agent, call, tabs } = await setup();
        const result = await call({ path: "no-such-file.md" });
        expect(result.isError).toBe(true);
        expect(result.output).toMatch(/not found/i);
        expect(await tabs()).toHaveLength(0);
        expect(await ctx.fns.canvas.get({ agentId: agent.id })).toMatchObject({ open: false, activeItemId: null });
    });

    test("shows a directory and keeps the path pinned absolute", async () => {
        const { call, tabs } = await setup();
        const out = JSON.parse((await call({ path: "sub", mode: "preview" })).output);
        expect(out.path).toBe(`${ABS_DIR}/sub`);
        expect((await tabs())[0].args).toMatchObject({ path: `${ABS_DIR}/sub`, mode: "preview" });
    });

    test("rejects agent selectors, canvas kinds and unknown arguments without any canvas change", async () => {
        const { ctx, agent, call, tabs } = await setup();
        const before = await ctx.fns.canvas.get({ agentId: agent.id });
        for (const extra of [{ agentId: "someone-else" }, { agent: "x" }, { kind: "html" }, { html: "<p>x</p>" }, { url: "https://example.com" }, { owner: "x" }]) {
            const result = await call({ path: "report.md", ...extra });
            expect(result.isError).toBe(true);
            expect(result.output).toMatch(/invalid arguments|unknown argument/);
            expect(result.handlerExecuted).toBe(false);
        }
        expect(await tabs()).toHaveLength(0);
        expect(await ctx.fns.canvas.get({ agentId: agent.id })).toEqual(before);
        // Adapter-level selectors are rejected even when called directly with a trusted session.
        const direct = ctx.fns.session.forAgent({ agent });
        await expect(ctx.state.registry.tools.showArtifact(ctx, direct, { path: "report.md", agentId: "x" })).rejects.toThrow("unknown argument agentId");
        await expect(ctx.state.registry.tools.showArtifact(ctx, direct, { path: "  " })).rejects.toThrow("non-empty string");
    });

    test("without a trusted invocation it fails instead of falling back to a current agent", async () => {
        const { ctx, tabs } = await setup();
        await expect(ctx.fns.tools.showArtifact({ path: "report.md" })).rejects.toThrow("trusted agent invocation");
        expect(await tabs()).toHaveLength(0);
    });

    test("the tab belongs to the invoking agent's canvas only", async () => {
        const { ctx, agent, call, tabs } = await setup();
        const other = await ctx.fns.agent.start({ model: "test:model", systemPrompt: "", workspaceDir: ABS_DIR });
        other.preset = snapshot(["*"]);
        await ctx.fns.session.save({ agent: other });
        const out = JSON.parse((await call({ path: "report.md" })).output);
        expect((await tabs()).map((t: any) => t.id)).toEqual([out.itemId]);
        expect(await tabs(other.id)).toHaveLength(0);
        expect(await ctx.fns.canvas.get({ agentId: other.id })).toMatchObject({ open: false, activeItemId: null });
        expect(agent.id).not.toBe(other.id);
    });
});

describe("show_artifact gating and guidance", () => {
    test("denying the adapter removes the tool while canvas.show stays reachable through evaluation", async () => {
        const { ctx, agent, call, tabs } = await setup(snapshot(["*"], ["tools.showArtifact"]));
        expect(ctx.fns.agent.wireTools({ agent }).map((t: any) => t.name)).not.toContain("show_artifact");
        const result = await call({ path: "report.md" });
        expect(result.isError).toBe(true);
        expect(result.output).toMatch(/unknown tool "show_artifact"/);
        expect(result.handlerExecuted).toBe(false);
        expect(await tabs()).toHaveLength(0);
        const item = await ctx.fns.canvas.show({ agentId: agent.id, kind: "file", args: { path: "report.md" } });
        expect((await tabs()).map((t: any) => t.id)).toEqual([item.id]);
    });

    test("denying canvas.show or files.embedUrl removes the tool and rejects a direct call", async () => {
        for (const denied of ["canvas.show", "files.embedUrl"]) {
            const { ctx, agent, call, tabs } = await setup(snapshot(["*"], [denied]));
            expect(ctx.fns.agent.wireTools({ agent }).map((t: any) => t.name)).not.toContain("show_artifact");
            const result = await call({ path: "report.md" });
            expect(result.isError).toBe(true);
            expect(result.output).toMatch(/unknown tool "show_artifact"/);
            expect(await tabs()).toHaveLength(0);
        }
    });

    test("the Canvas prompt names show_artifact only when the agent can call it", async () => {
        const { ctx, agent } = await setup(snapshot(["*"]));
        const full = await ctx.fns.agent.fullSystemPrompt({ agent });
        expect(full).toContain("show_artifact tool");
        expect(full).not.toContain('use canvas.show with kind:"file"');
        // Other kinds keep the canvas.show guidance.
        expect(full).toContain("canvas.show({ kind, args, title? })");
        expect(full).toContain("`html`");
        agent.preset = snapshot(["*"], ["tools.showArtifact"]);
        const narrowed = await ctx.fns.agent.fullSystemPrompt({ agent });
        expect(narrowed).not.toContain("show_artifact");
        expect(narrowed).toContain('use canvas.show with kind:"file"');
    });

    test("the schema is a strict object without owner or kind selectors and survives every provider adapter", async () => {
        const { ctx, agent } = await setup();
        const spec = ctx.fns.agent.wireTools({ agent }).find((t: any) => t.name === "show_artifact");
        expect(spec.parameters).toMatchObject({ type: "object", additionalProperties: false, required: ["path"] });
        expect(Object.keys(spec.parameters.properties).sort()).toEqual(["host", "mode", "path", "title"]);
        expect(JSON.stringify(spec.parameters)).not.toMatch(/"(agent|agentId|owner|session|kind|html|url)"/);
        const p = ctx.fns.models.protocol;
        expect(p.anthropic.toTools({ tools: [spec] })).toEqual([{ name: "show_artifact", description: spec.description, input_schema: spec.parameters }]);
        expect(p.gemini.toTools({ tools: [spec] })).toEqual([{ functionDeclarations: [{ name: "show_artifact", description: spec.description, parameters: spec.parameters }] }]);
        expect(p.openaiChat.toTools({ tools: [spec] })[0].function.parameters).toEqual(spec.parameters);
        expect(spec.description.length).toBeLessThan(600);
    });
});
