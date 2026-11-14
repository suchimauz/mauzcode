import { expect, test } from "bun:test";
import { join } from "node:path";

test("models source has no legacy runtime calls, imports or types", async () => {
    const violations: string[] = [];
    for await (const rel of new Bun.Glob("**/*.ts").scan(import.meta.dir)) {
        const source = await Bun.file(join(import.meta.dir, rel)).text();
        if (/\bfns\s*\.\s*llm\s*\./.test(source) || /\btypes\s*\.\s*llm\s*\./.test(source) || /(?:from\s*|import\s*\()["'][^"']*\/llm\//.test(source)) violations.push(rel);
    }
    expect(violations).toEqual([]);
});
