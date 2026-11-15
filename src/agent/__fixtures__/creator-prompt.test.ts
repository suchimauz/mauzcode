import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { testCtx } from "../../$test";

// Pre-split baseline: deliberately assembled by the unchanged production function.
// Explicit fixture values avoid dependence on cwd, user plugins or user settings.
// UPDATE_CREATOR_PROMPT=1 is only for the initial capture, never for equivalence fixes.
test("capture the pre-split Creator prompt for a fixed fixture agent", async () => {
    const ctx = await testCtx();
    ctx.state.registry.plugins.list = () => [{
        name: "openspec", source: "official", namespaces: ["openspec"],
        description: "Fixture plugin for deterministic Creator prompt coverage.",
    }];
    const agent = {
        id: "fixture", model: "mock:test", workspaceDir: "/fixture/workspace",
        systemPrompt: "Fixture per-agent instructions.", messages: [], events: [], scratchpad: {},
    } as any;
    const prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
    const path = resolve(import.meta.dir, "creator-prompt.before.md");
    if (process.env.UPDATE_CREATOR_PROMPT === "1") await Bun.write(path, prompt);
    expect(prompt).toBe(await Bun.file(path).text());
});
