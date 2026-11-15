import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { testCtx } from "../../$test";

// Immutable pre-split baseline committed as e0230a31; never recapture it.
// Runtime context had no blank separator in the original; compare its lines independently.
test("Creator preserves the reviewed pre-split prompt", async () => {
    const ctx = await testCtx();
    ctx.state.registry.plugins.list = () => [{
        name: "openspec", source: "official", namespaces: ["openspec"],
        description: "Fixture plugin for deterministic Creator prompt coverage.",
    }];
    ctx.state.registry.openspec = { run: () => {} };
    const agent = {
        id: "fixture", model: "mock:test", workspaceDir: "/fixture/workspace",
        systemPrompt: "Fixture per-agent instructions.", messages: [], events: [], scratchpad: {},
    } as any;
    const prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
    const path = resolve(import.meta.dir, "creator-prompt.before.md");
    const before = await Bun.file(path).text();
    const manifest = await Bun.file(resolve(import.meta.dir, "creator-prompt.relocations.json")).json();
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    const missing = before.split(/\n\s*\n/).filter(p => !manifest.paragraphs.includes(p)).flatMap(p => p.includes("## Runtime context") ? p.split("\n") : [p]).filter(p => !normalize(prompt).includes(normalize(p)));
    expect(missing).toEqual([]);
});
