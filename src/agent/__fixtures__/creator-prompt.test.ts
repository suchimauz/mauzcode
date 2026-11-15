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
    // Only these three exact baseline hashes have capability-split replacements.
    // No baseline or relocation exemptions are rewritten; every replacement stays asserted.
    const splits: Record<string, string[]> = await Bun.file(resolve(import.meta.dir, "scoped-guidance-splits.json")).json();
    expect(Object.keys(splits)).toHaveLength(3);
    const paragraphs = before.split(/\n\s*\n/).filter(p => !manifest.paragraphs.includes(p));
    for (const [hash, fragments] of Object.entries(splits)) {
        expect(paragraphs.some(p => new Bun.CryptoHasher("sha256").update(p).digest("hex") === hash)).toBe(true);
        for (const fragment of fragments) expect(normalize(prompt)).toContain(normalize(fragment));
    }
    expect(prompt).toContain('To show files beside chat, use canvas.show with kind:"file".');
    expect(prompt).toContain('not `ui.openFile`, which navigates the whole page away from the chat.');
    const missing = paragraphs.filter(p => !splits[new Bun.CryptoHasher("sha256").update(p).digest("hex")]).flatMap(p => p.includes("## Runtime context") ? p.split("\n") : [p]).filter(p => !normalize(prompt).includes(normalize(p)));
    expect(missing).toEqual([]);
});
