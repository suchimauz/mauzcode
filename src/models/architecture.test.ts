import { expect, test } from "bun:test";
import { resolve, relative } from "node:path";
import ts from "typescript";

// Parse executable property accesses, not strings/comments containing fixture source.
function violations(path: string, source: string): string[] {
    if (path.startsWith("src/models/")) return [];
    const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const found: string[] = [];
    const chain = (node: ts.Node): string[] => {
        if (ts.isIdentifier(node)) return [node.text];
        if (ts.isPropertyAccessExpression(node)) return [...chain(node.expression), node.name.text];
        if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) return [...chain(node.expression), node.argumentExpression.text];
        return [];
    };
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
            const parts = chain(node.expression);
            const at = parts.indexOf("fns");
            if (at >= 0 && parts[at + 1] === "models" && ["inference", "connections", "catalog", "transport", "protocol", "provider"].includes(parts[at + 2] ?? "")) {
                found.push(`${path}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${parts.join(".")}`);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

test("all repository consumers use the public models facade", async () => {
    const root = resolve(import.meta.dir, "../..");
    const failures: string[] = [];
    for (const dir of ["src", "plugins", "frontend/src", "script", "tests"]) {
        for await (const file of new Bun.Glob("**/*.{ts,tsx,js,jsx}").scan({ cwd: resolve(root, dir), absolute: true })) {
            const path = relative(root, file);
            if (path.includes("/node_modules/") || path.endsWith(".d.ts")) continue;
            failures.push(...violations(path, await Bun.file(file).text()));
        }
    }
    expect(failures).toEqual([]);
});

test("injected private calls fail and name caller, while quoted fixture code does not", () => {
    for (const ns of ["inference", "connections", "catalog", "transport", "protocol", "provider"]) {
        expect(violations("src/agent/injected.ts", `ctx.fns.models.${ns}.hidden({})`)).toEqual([`src/agent/injected.ts:1: ctx.fns.models.${ns}.hidden`]);
    }
    expect(violations("plugins/example/src/run.ts", 'ctx.fns.models["protocol"].hidden({})')).toHaveLength(1);
    expect(violations("src/code/fixture.test.ts", 'const source = "ctx.fns.models.provider.example.hidden({})";')).toEqual([]);
    expect(violations("src/agent/good.ts", "ctx.fns.models.resolveRoute({route:'x/a:m'})")).toEqual([]);
    expect(violations("src/models/inside.ts", "ctx.fns.models.inference.resolveRoute({route:'x/a:m'})")).toEqual([]);
});
