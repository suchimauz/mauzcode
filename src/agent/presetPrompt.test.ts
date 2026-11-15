import { expect, test } from "bun:test";
import { testCtx } from "../$test";

const ctx = await testCtx();
// Deterministic plugin catalogue: installed user plugins must not affect prompt budgets.
ctx.state.registry.plugins.list = () => [{ name: "openspec", source: "official", namespaces: ["openspec"], description: "Spec workflow" }];
ctx.state.registry.openspec = { run: () => {} };
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
    expect(prompt).toContain("ctx.fns.session.plan");
    expect(prompt.indexOf("## Preset instructions")).toBeLessThan(prompt.indexOf("## Per-agent instructions"));
    expect(prompt).toContain("Answer in English");
    agent.preset.layers.push({ ...agent.preset.layers[0], excludeSections: ["plans"], prompt: "Second layer" });
    prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
    expect(prompt).not.toContain("ctx.fns.session.plan");
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
        expect(prompt).not.toContain("ctx.fns.plugins.search");
        expect(prompt).not.toContain("Plugin section sentinel");
        await ctx.fns.agentPreset.update({ id: "standard", patch: { plugins: ["openspec"] } });
        const granted = await fixture("standard");
        prompt = await ctx.fns.agent.fullSystemPrompt({ agent: granted });
        expect(prompt).toContain("## Mounted plugins");
        expect(prompt).toContain("ctx.fns.plugins.search");
        expect(prompt).toContain("Plugin section sentinel");
        expect(await ctx.fns.agent.fullSystemPrompt({ agent: await fixture("creator") })).toContain("Plugin section sentinel");
        expect(await ctx.fns.agent.fullSystemPrompt({ agent: standard })).not.toContain("Plugin section sentinel");
    } finally {
        ctx.state.registry.plugins.list = oldList;
        ctx.state.registry.openspec = { run: () => {} };
        ctx.state.prompts.registry.delete("fixturePlugin");
        await ctx.fns.agentPreset.reset({ id: "standard" });
    }
});

test("custom deny and inherited intersection suppress capability sections", async () => {
    for (const mode of ["deny", "intersection", "exclude"]) {
        const agent = await fixture("creator");
        const layer = structuredClone(agent.preset.layers[0]);
        if (mode === "deny") layer.deny = ["session.plan"];
        if (mode === "intersection") layer.allow = ["tools.*"];
        if (mode === "exclude") layer.excludeSections = ["plans"];
        agent.preset = { ...agent.preset, layers: [...agent.preset.layers, layer] };
        const prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
        expect(prompt).not.toContain("ctx.fns.session.plan");
        expect(prompt).toContain("workspace AGENTS.md");
    }
});

test("external workspace remains explicit and Standard guards raw Bun filesystem cwd", async () => {
    const agent = await fixture("standard");
    agent.workspaceDir = "/external/customer-project";
    const prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
    expect(prompt).toContain("/external/customer-project");
    expect(prompt).not.toContain("ctx.fns.code.index");
    expect(prompt).not.toContain("docs/architecture.md");
    expect(prompt).not.toContain("docs/skills/apple-design");
    expect(prompt).not.toMatch(/(?:target|current) project.{0,60}(?:must|should).{0,30}procedur/i);
    expect(prompt).toContain("Bun.file");
    expect(prompt).toContain("Bun.write");
    expect(prompt).toMatch(/server.{0,30}cwd/i);
    expect(prompt).toMatch(/workspace-aware|workspace\.resolve|absolute workspace paths/);
    agent.workspaceHost = "fixture-ssh";
    expect(await ctx.fns.agent.fullSystemPrompt({ agent })).toContain("fixture-ssh:/external/customer-project");
});

test("Minimal guides only its available tools, not absent search or eval tools", async () => {
    const agent = await fixture("minimal");
    const prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
    expect(ctx.fns.agent.wireTools({ agent }).map(tool => tool.name).sort()).toEqual(["bash", "edit", "read", "write"]);
    expect(prompt).not.toMatch(/`(?:grep|find|eval|tools_eval)`/);
    expect(prompt).not.toContain("ctx.fns");
    expect(prompt).toContain("AGENTS.md");
});

test("optional eval and messaging capabilities respect deny and section exclusion", async () => {
    for (const mode of ["deny", "exclude"]) {
        const agent = await fixture("standard");
        const layer = structuredClone(agent.preset.layers[0]);
        if (mode === "deny") layer.deny = ["agent.readResult", "agent.search"];
        else layer.excludeSections = ["eval", "agentMessaging"];
        agent.preset = { ...agent.preset, layers: [layer] };
        const prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
        expect(prompt).not.toContain("ctx.fns.agent.readResult");
        expect(prompt).not.toContain("ctx.fns.agent.search");
        if (mode === "deny") {
            expect(prompt).toMatch(/workspace-aware|workspace\.resolve|absolute workspace paths/);
            expect(prompt).toContain("<agent-message");
            expect(prompt).toMatch(/(?:authority|authoriz|user instruction)/i);
        }
    }
});

test("shared context optional lookup and results preserve delegation and exclusions", async () => {
    for (const denied of ["sharedAgent.list", "sharedAgent.result"]) {
        const agent = await fixture("standard");
        agent.preset.layers[0].deny = [denied];
        const prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
        expect(prompt).not.toContain(`ctx.fns.${denied}`);
        expect(prompt).toContain("ctx.fns.sharedAgent.delegate");
        expect(prompt).toContain("Never publish or unpublish");
        agent.preset.layers[0].excludeSections = ["sharedAgents"];
        const excluded = await ctx.fns.agent.fullSystemPrompt({ agent });
        expect(excluded).not.toContain("ctx.fns.sharedAgent.");
    }
});

test("static section callable examples declare every capability requirement", () => {
    const violations: string[] = [];
    for (const section of ctx.state.prompts.registry.values()) {
        if (section.generator) continue;
        for (const match of section.body.matchAll(/ctx\.fns\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*\(/g)) {
            const name = match[1]!;
            if (!section.requires.includes(name)) violations.push(`${section.id}: ${name}`);
        }
    }
    expect(violations).toEqual([]);
});

test("denying any declared capability never advertises its callable in assembled prompts", async () => {
    const names = new Set([...ctx.state.prompts.registry.values()].flatMap(section => section.requires));
    for (const name of ["plugins.search", "plugins.read", "plugins.functions", "agent.readResult", "agent.search", "sharedAgent.list", "sharedAgent.result"]) names.add(name);
    const violations: string[] = [];
    for (const name of names) {
        const agent = await fixture("creator");
        agent.preset = structuredClone(agent.preset);
        agent.preset.layers[0].deny = [name];
        const prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
        const advertised = [...prompt.matchAll(/ctx\.fns\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*\(/g)].map(match => match[1]);
        if (advertised.includes(name)) violations.push(name);
    }
    expect(violations).toEqual([]);
});

test("fixed-fixture prompt budgets preserve historical before measurements and native schemas", async () => {
    const before = await Bun.file(new URL("presetPrompt.before.fixture.json", import.meta.url)).json();
    // Reviewed headroom preserves safety: Standard shrinks >=13%, Creator >=22%, Minimal >=16%.
    const limits = { minimal: 2500, standard: 17500, creator: 25000 };
    for (const id of ["minimal", "standard", "creator"] as const) {
        const agent = await fixture(id);
        const prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
        expect(prompt.length).toBeLessThanOrEqual(limits[id]);
        expect(prompt).not.toContain("## Preset instructions");
        expect(prompt).not.toContain("## Per-agent instructions");
        const native = ctx.fns.agent.wireTools({ agent });
        expect(native.length).toBe(before[id].nativeToolCount);
        // Wire schemas are a separate payload: shortening prose must not alter them.
        expect(JSON.stringify(native).length).toBe(before[id].nativeSchemaChars);
        const historicalSchemaHash = id === "minimal"
            ? "b1cc0db10cff244508092ffd7a919f5f7fe596b40df39aec6ed88ec20769d10c"
            : "12b81d97823aaf90f4f65ce55a8713cb003e908d6fc10d828d6cfd88328f68c2";
        expect(new Bun.CryptoHasher("sha256").update(JSON.stringify(native)).digest("hex")).toBe(historicalSchemaHash);
    }
});
