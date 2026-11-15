import { expect, test } from "bun:test";
import { resolve } from "node:path";
import pluginsPrompt from "../plugins/promptSection";

test("optimized sections preserve scope, safety and discoverable project policies", async () => {
    const root = resolve(import.meta.dir, "../agent");
    const before = await Bun.file(`${root}/__fixtures__/creator-prompt.before.md`).text();
    expect(new Bun.CryptoHasher("sha256").update(before).digest("hex")).toBe("97d135f6bfeb3d8f38b240ac28c3d29e773167316b11c7f2349877bddb3b7be1");
    const base = await Bun.file(`${root}/SYSTEM_PROMPT_BASE.md`).text();
    expect(base).not.toContain("ctx.fns");
    for (const rule of ["workspace AGENTS.md", "host runtime is not the target project", "Never mutate", "Never ask for secrets", "human approval", "Verify effects"]) expect(base).toContain(rule);
    const project = await Bun.file(resolve(root, "../../AGENTS.md")).text();
    for (const reference of ["docs/runtime-authoring.md", "docs/runtime-operations.md", "docs/testing.md", "docs/ui-maintenance.md"]) {
        expect(project).toContain(reference);
        expect(await Bun.file(resolve(root, "../..", reference)).exists()).toBe(true);
    }
    expect(project).toContain("MauzCode's UI");
    expect(project).toContain("docs/skills/apple-design/SKILL.md");
    const authoring = await Bun.file(`${root}/$prompt_authoring.md`).text();
    expect(authoring).toContain('ctx.fns.runtime.docs.get({ name: "procs.dev.createFunction" })');
    expect(authoring).not.toContain("src/<mod>");
});

test("plugin workflow requires reachable discovery and omits denied management", () => {
    const ctx = { state: { registry: { openspec: { run() {} } } }, fns: { plugins: { list: () => [{ name: "openspec", source: "official", description: "Spec workflow", namespaces: ["openspec"] }] } } } as any;
    expect(pluginsPrompt(ctx, null, { allows: () => false })).toBe("");
    const names = ["openspec.run", "plugins.search", "plugins.read", "plugins.functions"];
    const granted = pluginsPrompt(ctx, null, { allows: name => names.includes(name) });
    expect(granted).toContain("Plugin workflow");
    expect(granted).toContain("openspec");
    expect(granted).not.toContain("Manage plugins");
    for (const denied of names) expect(pluginsPrompt(ctx, null, { allows: name => names.includes(name) && name !== denied })).toBe("");
    expect(pluginsPrompt(ctx, null, { allows: () => true })).toContain("Manage plugins");
});
