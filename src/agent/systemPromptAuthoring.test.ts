import { expect, test } from "bun:test";
import { testCtx } from "../$test";

const ctx = await testCtx();

test("runtime authoring is discovered on demand rather than duplicated in every prompt", async () => {
    const prompt = await ctx.fns.agent.fullSystemPrompt({ agent: { id: "new", model: "mock:test", systemPrompt: "", messages: [], events: [], scratchpad: {} } as any });
    expect(prompt).toContain("procs.dev.createFunction");
    expect(prompt).toContain("ctx.fns.runtime.docs.get");
    expect(prompt).not.toContain("ctx.fns.procs.dev.typecheck({}) ONCE");
    const guide = JSON.stringify(await ctx.fns.runtime.docs.get({ name: "procs.dev.createFunction" }));
    for (const invariant of ["One procedure per lower-case file", "No imports between project files", "returnType", "runtime.docs.validate", "procs.dev.typecheck", "one owner", "procs.dev.genTypes", "procs.http.loadRoutes", "procs.migrate.up", "localized keyword lists", "host project"]) {
        expect(guide).toContain(invariant);
    }
});
