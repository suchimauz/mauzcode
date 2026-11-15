import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import load from "./$loader_prompt";
import reload from "../procs/repl/load";
import classify from "../procs/project/classify";

test("prompt declarations load, reload, rename and reject missing or duplicate IDs atomically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mauz-prompts-"));
    const ctx = { state: {} } as any;
    const entry = { abs: join(dir, "$prompt_example.md"), rel: "example/$prompt_example.md" };
    const declaration = (id: string, body: string) => `---\nid: ${id}\ntitle: Example\nrequires: [tools.read]\norder: 20\n---\n${body}`;
    try {
        await Bun.write(entry.abs, declaration("example", "first"));
        await load(ctx, null, { entries: [entry] });
        expect(ctx.state.prompts.registry.get("example").body).toBe("first");
        await Bun.write(entry.abs, declaration("example", "second"));
        await load(ctx, null, { entries: [entry] });
        expect(ctx.state.prompts.registry.size).toBe(1);
        expect(ctx.state.prompts.registry.get("example").body).toBe("second");
        const duplicate = { abs: join(dir, "$prompt_duplicate.md"), rel: "duplicate" };
        await Bun.write(duplicate.abs, declaration("example", "bad"));
        await expect(load(ctx, null, { entries: [duplicate] })).rejects.toThrow("duplicate id");
        await Bun.write(duplicate.abs, "---\ntitle: Missing\nrequires: []\norder: 1\n---\nmissing");
        await expect(load(ctx, null, { entries: [duplicate] })).rejects.toThrow("id is required");
        expect(ctx.state.prompts.registry.get("example").body).toBe("second");
        await Bun.write(entry.abs, declaration("renamed", "third"));
        await load(ctx, null, { entries: [entry] });
        expect(ctx.state.prompts.registry.has("example")).toBe(false);
        expect(ctx.state.prompts.registry.get("renamed").requires).toEqual(["tools.read"]);
        expect(ctx.state.prompts.generation).toBe(3);
        // A plugin declaration uses exactly the same scanner and hot reload path.
        const classified = classify(ctx, null, { rel: "example/$prompt_example.md" });
        expect(classified.kind).toBe("prompt");
        const scanned = { ...classified, abs: entry.abs, root: "plugin-example" };
        ctx.state.procs = { boot: { loaders: { prompt: load } } };
        ctx.fns = { procs: { project: { scan: async () => [scanned] } } };
        await Bun.write(entry.abs, declaration("renamed", "hot reloaded"));
        const result = await reload(ctx, null, { name: "example" });
        expect("files" in result ? result.files : []).toEqual([entry.rel]);
        expect(ctx.state.prompts.registry.get("renamed").body).toBe("hot reloaded");
    } finally { await rm(dir, { recursive: true, force: true }); }
});
