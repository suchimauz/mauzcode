import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { testCtx } from "../../$test";

// Immutable pre-split baseline committed as e0230a31; never recapture it.
// Runtime context had no blank separator in the original; compare its lines independently.
test("Creator preserves safety and discovery invariants without freezing historical prose", async () => {
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
    // Historical artifacts are evidence, not snapshots to recapture when wording changes.
    expect(new Bun.CryptoHasher("sha256").update(before).digest("hex")).toBe("97d135f6bfeb3d8f38b240ac28c3d29e773167316b11c7f2349877bddb3b7be1");
    expect(manifest.snapshotCommit).toBe("e0230a31");
    for (const invariant of [
        "workspace AGENTS.md", "/fixture/workspace", "Fixture per-agent instructions.",
        "Never mutate", "secrets", "human approval", "Verify effects",
        "ctx.fns.runtime.docs.get", "procs.dev.createFunction", "ctx.fns.procs.repl.load",
        "ctx.fns.code.slice", "ctx.fns.code.callers", "ctx.fns.agent.delegate",
        "ctx.fns.session.plan", "ctx.fns.input.request", "ctx.fns.plugins.search",
        "ctx.fns.plugins.read", "Bun.file", "Bun.write", "SERVER's cwd",
    ]) expect(prompt).toContain(invariant);
    expect(prompt).not.toContain("docs/architecture.md");
    expect(prompt).not.toContain("MauzCode UI implementation");
});
