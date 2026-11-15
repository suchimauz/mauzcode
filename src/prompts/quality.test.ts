import { test, expect } from "bun:test";
import { testCtx } from "../$test";

test("prompt generators are production-reachable in the isolated call graph", async () => {
    const ctx = await testCtx();
    await ctx.fns.code.index({});
    const result = await ctx.fns.code.quality({ rule: "dead", limit: 500 });
    const text = JSON.stringify(result);
    for (const name of ["plugins.promptSection", "tools.promptSection", "input.promptSection", "canvas.promptSection", "markdown.promptSection"]) expect(text).not.toContain(`\"name\":\"${name}\"`);
}, 120000);
