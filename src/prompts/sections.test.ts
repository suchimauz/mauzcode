import { expect, test } from "bun:test";
import { resolve } from "node:path";
import pluginsPrompt from "../plugins/promptSection";

test("split preserves every CORE paragraph except the exact relocated policies", async () => {
    const root = resolve(import.meta.dir, "../agent");
    const core = (await Bun.file(`${root}/__fixtures__/creator-prompt.before.md`).text()).split("## Available tools")[0]!;
    const relocation = await Bun.file(`${root}/__fixtures__/creator-prompt.relocations.json`).json();
    const project = await Bun.file(resolve(root, "../../AGENTS.md")).text();
    const bodies = [await Bun.file(`${root}/SYSTEM_PROMPT_BASE.md`).text()];
    for await (const path of new Bun.Glob("$prompt_*.md").scan(root)) bodies.push((await Bun.file(`${root}/${path}`).text()).split("\n---\n")[1]!);
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const compatibilityHash = "962f9c5523795700eb5370d2598270634267ea80620899032b85ad6c806af49f";
    const splits = await Bun.file(`${root}/__fixtures__/scoped-guidance-splits.json`).json();
    for (const paragraph of core.split(/\n\s*\n/).filter(Boolean)) {
        if (relocation.paragraphs.includes(paragraph)) expect(project).toContain(paragraph);
        else if (new Bun.CryptoHasher("sha256").update(paragraph).digest("hex") === compatibilityHash) {
            for (const fragment of splits[compatibilityHash]) expect(normalize(bodies.join("\n\n"))).toContain(normalize(fragment));
            // The file-opening sentence moved to the capability-scoped canvas generator.
            expect(await Bun.file(resolve(root, "../canvas/promptSection.ts")).text()).toContain('To show files beside chat, use canvas.show with kind:"file".');
        }
        else expect(normalize(bodies.join("\n\n"))).toContain(normalize(paragraph));
    }
    expect(bodies[0]).not.toContain("ctx.fns");
    expect(bodies[0]).toContain("workspace AGENTS.md");
});

test("plugin workflow is absent with zero reachable functions and narrowed without management", () => {
    const ctx = { state: { registry: { openspec: { run() {} } } }, fns: { plugins: { list: () => [{ name: "openspec", source: "official", description: "Spec workflow", namespaces: ["openspec"] }] } } } as any;
    expect(pluginsPrompt(ctx, null, { allows: () => false })).toBe("");
    const granted = pluginsPrompt(ctx, null, { allows: name => name === "openspec.run" });
    expect(granted).toContain("Plugin workflow");
    expect(granted).toContain("openspec");
    expect(granted).not.toContain("Manage plugins");
    expect(pluginsPrompt(ctx, null, { allows: () => true })).toContain("Manage plugins");
});
