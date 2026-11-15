import { expect, test } from "bun:test";
import { testCtx } from "../$test";

const ctx = await testCtx();
const fixture = async (id: string) => ({ id: "fixture", model: "mock:test", workspaceDir: "/fixture/workspace", systemPrompt: "", messages: [], events: [], scratchpad: {}, preset: await ctx.fns.agentPreset.resolve({ id }) } as any);

test("Standard and Minimal retain project instructions without denied capability guidance", async () => {
    for (const id of ["standard", "minimal", "creator"]) {
        const prompt = await ctx.fns.agent.fullSystemPrompt({ agent: await fixture(id) });
        expect(prompt).toContain("workspace AGENTS.md");
        expect(prompt).not.toContain("MauzCode UI design");
        expect(prompt).not.toContain("MauzCode UI implementation");
        if (id !== "creator") {
            expect(prompt).not.toContain("ctx.fns.procs.dev.createFunction");
            expect(prompt).not.toContain("plugins.load/add/remove/reload");
        }
        if (id === "minimal") {
            expect(prompt).not.toContain("ctx.fns");
            expect(prompt).not.toContain("## Chat inputs");
            expect(prompt).not.toContain("## Canvas");
            expect(prompt).not.toContain("Universal calling convention");
        }
    }
});

test("access includes sections, any layer excludes them, and prompt additions precede per-agent instructions", async () => {
    const agent = await fixture("standard");
    agent.systemPrompt = "Per agent sentinel";
    agent.preset.layers[0].prompt = "Answer in English";
    let prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
    expect(prompt).toContain("Plans for non-trivial multi-step work");
    expect(prompt.indexOf("## Preset instructions")).toBeLessThan(prompt.indexOf("## Per-agent instructions"));
    expect(prompt).toContain("Answer in English");
    agent.preset.layers.push({ ...agent.preset.layers[0], excludeSections: ["plans"], prompt: "Second layer" });
    prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
    expect(prompt).not.toContain("Plans for non-trivial multi-step work");
    expect(prompt).toContain("Second layer");
});

test("Standard discovers no plugin workflow until openspec is granted; plugin sections follow the same rule", async () => {
    const oldList = ctx.state.registry.plugins.list;
    ctx.state.registry.plugins.list = () => [{ name: "openspec", source: "official", namespaces: ["openspec"], description: "Spec workflow" }];
    ctx.state.registry.openspec = { run: () => {} };
    ctx.state.prompts.registry.set("fixturePlugin", { id: "fixturePlugin", requires: ["openspec.run"], order: 200, body: "Plugin section sentinel" });
    try {
        const standard = await fixture("standard");
        let prompt = await ctx.fns.agent.fullSystemPrompt({ agent: standard });
        expect(prompt).not.toContain("## Mounted plugins");
        expect(prompt).not.toContain("Plugin workflow (ordinary functions");
        expect(prompt).not.toContain("Plugin section sentinel");
        await ctx.fns.agentPreset.update({ id: "standard", patch: { plugins: ["openspec"] } });
        const granted = await fixture("standard");
        prompt = await ctx.fns.agent.fullSystemPrompt({ agent: granted });
        expect(prompt).toContain("## Mounted plugins");
        expect(prompt).toContain("Plugin workflow (ordinary functions");
        expect(prompt).toContain("Plugin section sentinel");
        expect(await ctx.fns.agent.fullSystemPrompt({ agent: await fixture("creator") })).toContain("Plugin section sentinel");
        expect(await ctx.fns.agent.fullSystemPrompt({ agent: standard })).not.toContain("Plugin section sentinel");
    } finally {
        ctx.state.registry.plugins.list = oldList;
        delete ctx.state.registry.openspec;
        ctx.state.prompts.registry.delete("fixturePlugin");
        await ctx.fns.agentPreset.reset({ id: "standard" });
    }
});
