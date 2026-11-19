import { expect, test } from "bun:test";
import { join } from "node:path";

// The Voice SDK is independent by contract: it may not import the Models SDK, its types, or the Whisper plugin.
// A dependency here would make the composer's recognizer choice depend on LLM routing and would let a vendor
// change in one SDK break the other.
test("voice source has no models, llm or whisper dependency", async () => {
    const violations: string[] = [];
    for await (const rel of new Bun.Glob("**/*.ts").scan(import.meta.dir)) {
        if (rel.endsWith(".test.ts")) continue;
        const source = await Bun.file(join(import.meta.dir, rel)).text();
        // Runtime calls and types of another SDK, plus any relative import that leaves this module.
        if (/\bfns\s*\.\s*models\s*\./.test(source) || /\btypes\s*\.\s*models\s*\./.test(source)) violations.push(rel);
        if (/(?:from\s*|import\s*\()\s*["'](?:\.\.\/)+(?:models|whisper)\//.test(source)) violations.push(rel);
        if (/\b(?:fns|types)\s*\.\s*(?:whisper|llm)\s*\./.test(source)) violations.push(rel);
    }
    expect(violations).toEqual([]);
});

test("voice types reference only their own namespace and framework globals", async () => {
    const offenders: string[] = [];
    for await (const rel of new Bun.Glob("*.ts").scan(import.meta.dir)) {
        if (rel.endsWith(".test.ts") || rel.startsWith("$")) continue;
        const source = await Bun.file(join(import.meta.dir, rel)).text();
        // A declaration file may import node and npm packages, but never a project file.
        const relativeImport = /(?:from\s*|import\s*\()\s*["']\.\.?\//.exec(source);
        if (relativeImport) offenders.push(`${rel}: ${relativeImport[0]}`);
    }
    expect(offenders).toEqual([]);
});
