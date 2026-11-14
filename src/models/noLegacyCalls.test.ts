import { expect, test } from 'bun:test';
import ts from 'typescript';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dir, '../..');
const retired = new Set(['llm', 'llms', 'node']);

// Parse executable syntax, not comments, documentation or quoted fixture code.
function dependencies(source: string, file: string): string[] {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const found = new Set<string>();
    function chain(node: ts.Node): string[] {
        if (ts.isIdentifier(node)) return [node.text];
        if (ts.isPropertyAccessExpression(node)) return [...chain(node.expression), node.name.text];
        if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)) return [...chain(node.expression), node.argumentExpression.text];
        return [];
    }
    function report(node: ts.Node, why: string) {
        found.add(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: ${why}`);
    }
    function visit(node: ts.Node) {
        if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
            const parts = chain(node);
            const i = parts.indexOf('fns');
            if (i >= 0 && retired.has(parts[i + 1] ?? '') && parts.length > i + 2) report(node, parts.slice(i).join('.'));
        }
        if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier) && /(?:^|\/)(?:legacy|llm|llms|node)\//.test(node.moduleSpecifier.text)) report(node, `retired import ${node.moduleSpecifier.text}`);
        if (ts.isCallExpression(node)) {
            // String-based dispatch must not resurrect a retired procedure.
            const callee = chain(node.expression).join('.');
            if (/(?:tools\.call|commands\.dispatch|runtime\.call|ui\.action)$/.test(callee)) {
                for (const arg of node.arguments) if (ts.isObjectLiteralExpression(arg)) for (const prop of arg.properties) {
                    if (ts.isPropertyAssignment(prop) && ['name', 'fn', 'action'].includes(prop.name.getText(ast).replace(/["']/g, '')) && ts.isStringLiteralLike(prop.initializer) && /^(llm|llms|node)\./.test(prop.initializer.text)) report(prop, `retired dispatch ${prop.initializer.text}`);
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(ast);
    return [...found];
}

async function sources(): Promise<string[]> {
    const files = new Set<string>();
    // Explicit project roots plus every shipped official plugin, including plugins
    // disabled in this process. Scratch and legacy are intentionally not roots.
    for (const pattern of ['src/**/*.{ts,tsx,js}', '.mauzcode/**/*.{ts,tsx,js}', 'plugins/*/src/**/*.{ts,tsx,js}', 'plugins/*/ui/**/*.{ts,tsx,js}']) {
        for await (const file of new Bun.Glob(pattern).scan({ cwd: root, dot: true })) {
            if (file.startsWith('.mauzcode/tmp/') || file.includes('/node_modules/') || file.includes('/dist/') || file.endsWith('.d.ts')) continue;
            files.add(file);
        }
    }
    return [...files].sort();
}

test('loaded project and official plugins have no executable legacy dependencies', async () => {
    const violations: string[] = [];
    for (const file of await sources()) violations.push(...dependencies(await Bun.file(resolve(root, file)).text(), file));
    expect(violations).toEqual([]);
});

test('guard fails a real injected call and names its file, including bracket access and dispatch', () => {
    for (const source of ['await ctx.fns.llm.call({});', 'ctx.fns["llms"].accounts({});', 'ctx.fns.node.models({});', 'ctx.fns.tools.call({name:"llm.call", args:{}});']) {
        const file = 'plugins/injected/src/example/run.ts';
        expect(dependencies(source, file).some(row => row.startsWith(file + ':1:'))).toBe(true);
    }
    expect(dependencies('import old from "../llm/call";', 'src/example/test.ts').length).toBeGreaterThan(0);
});

test('guard ignores prose and fixture strings without executable dependencies', () => {
    expect(dependencies('// ctx.fns.llm.call({})\nconst fixture = "ctx.fns.node.models({})"; const docs = `ctx.fns.llms.accounts({})`;', 'fixture.ts')).toEqual([]);
});

test('generated context declarations contain no retired runtime namespaces or imports', async () => {
    for await (const file of new Bun.Glob('src/ctx*.d.ts').scan({ cwd: root })) {
        const source = await Bun.file(resolve(root, file)).text();
        expect(source, relative(root, resolve(root, file))).not.toMatch(/^\s*(llm|llms|node)\s*:/m);
        expect(source).not.toMatch(/import\(["']\.\/(llm|llms|node)\//);
    }
});
