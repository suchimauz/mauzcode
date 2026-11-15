import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import ts from "typescript";
import { makeCtx } from "../$main";
import load from "../procs/boot/load";

const baseline = await Bun.file(join(import.meta.dir, "fixtures/public-contract.baseline.json")).json();
const normalize = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "").replace(/_session/g, "session");

test("root model procedures are exactly the minimal facade plus providers and api", async () => {
    const roots = [...new Bun.Glob("*.ts").scanSync(import.meta.dir)]
        .filter(file => !file.endsWith(".test.ts") && !file.startsWith("$") && /^[a-z]/.test(file))
        .map(file => file.slice(0, -3)).sort();
    expect(roots).toEqual([...Object.keys(baseline.procedures), "displayNames", "resolveRoute", "tokenPrice"].sort());
    expect(roots).toEqual(["action", "api", "call", "compact", "create", "displayNames", "get", "list", "listModels", "providers", "refreshAll", "remove", "resolveRoute", "setModelEnabled", "stream", "test", "tokenPrice", "update", "usage"]);
});

test("original public model signatures, async declarations, types and HTTP route contracts survive", async () => {
    for (const [name, contract] of Object.entries(baseline.procedures) as [string, { async: boolean; generator: boolean; parameters: string[]; returnType: string | null }][]) {
        const text = await readFile(join(import.meta.dir, `${name}.ts`), "utf8");
        const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
        const fn = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) as ts.FunctionDeclaration;
        expect(fn, name).toBeDefined();
        expect(!!fn.asteriskToken, name).toBe(contract.generator);
        expect(!!fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword), name).toBe(contract.async);
        expect(fn.parameters.map(p => normalize(p.getText(sf))), name).toEqual(contract.parameters.map(p => normalize(name === "stream" ? p.replace("tools?: Record<string, unknown>[]", "tools?: types.models.ToolSpec[]") : p)));
        expect(fn.type ? normalize(fn.type.getText(sf)) : null, name).toBe(contract.returnType ? normalize(contract.returnType) : null);
    }
    for (const [name, source] of Object.entries({...baseline.types, ...baseline.routes}) as [string, string][]) {
        // Intentional SDK additions are checked structurally, without rewriting the historical snapshot.
        let actual = normalize(await readFile(join(import.meta.dir, name), "utf8"));
        // Protocol routing and optional reasoning defaults are intentional SDK extensions.
        if (["ModelInfo.ts", "ReasoningCapabilities.ts"].includes(name)) actual = actual.replace("default?:types.models.ReasoningLevel", "default:types.models.ReasoningLevel").replace("wire?:Partial<Record<types.models.ReasoningLevel,string>>;", "").replace("disable?:boolean;", "").replace('protocol?:types.models.ProtocolRoute["protocol"];', "");
        if (name === "ModelInfo.ts") actual = actual.replace("default:types.models.ReasoningLevel;}", "default:types.models.ReasoningLevel}");
        if (name === "ReasoningResolution.ts") actual = actual.replace('applied:types.models.ReasoningLevel|"auto";', 'applied:types.models.ReasoningLevel;').replace("wire?:string;", "").replace("disable?:boolean;", "");
        if (name === "ProviderDefinition.ts") actual = actual.replace("route?:(ctx:Context,conn:types.models.ResolvedConnection,req:{model:string;info:types.models.ModelInfo|null;sessionId:string})=>Promise<types.models.ProtocolRoute>;", "");
        let expected = normalize(source);
        if (name === "StreamRequest.ts") expected = expected.replace("tools?:Record<string,unknown>[]", "tools?:types.models.ToolSpec[]");
        const additive: Record<string, string> = {
            "ProviderDefinition.ts": "inference?:{systemPreamble?:string;priceVendor?:string;};",
            "CallRequest.ts": "tools?:types.models.ToolSpec[];",
            "FailureInfo.ts": "resetAt?:number;",
            // fix-usage-window-classification: optional window identity/classification metadata.
            "UsageReport.ts": 'id?:string;period?:"fiveHour"|"weekly"|"monthly";scope?:"account"|"model"|"unknown";durationSeconds?:number;model?:string;observedAt?:number;',
        };
        expect(additive[name] ? actual.replace(additive[name], "") : actual, name).toBe(expected);
    }
});

// Real scanner and injecting proxy; no network, credentials, application DB or shared registry.
// Unique fixture operations avoid changing the actual catalogue or declaration owners.
test("fresh discovery preserves callable providers, nested dynamic facades, missing targets and exact-directory reload", async () => {
    const scratch = resolve(import.meta.dir, "../../.test-tmp/model-compat-tests");
    await mkdir(scratch, { recursive: true });
    const root = await mkdtemp(join(scratch, "isolated-"));
    const leaf = join(root, "src/models/provider/codex/compatFixture.ts");
    try {
        await Bun.write(join(root, "package.json"), JSON.stringify({ name: "models-compat-fixture", procs: { path: [], plugins: [], prod: {} } }));
        await Bun.write(join(root, "workspace.json"), JSON.stringify({ pluginRegistry: { version: 1, entries: [] } }));
        await Bun.write(leaf, 'export default function(ctx, session, opts) { if (opts.error) throw opts.error; opts.callback?.(opts.signal); return opts; }');
        await Bun.write(join(root, "src/models/compatFacade.ts"), 'export default function(ctx, session, opts) { return ctx.fns.models.provider.codex.compatFixture(opts); }');
        await Bun.write(join(root, "src/models/compatMissing.ts"), 'export default function(ctx, session, opts) { return ctx.fns.models.provider.codex.absentFixture(opts); }');
        await Bun.write(join(root, "src/compatOwner/$modelProvider_compat-fixture.ts"), 'export default { id: "compat-fixture", label: "Compatibility fixture", fields: [], transports: ["direct"], test: (ctx, conn) => ctx.fns.models.compatFacade(conn) };');
        const ctx = makeCtx();
        ctx.state.root = root;
        ctx.env = { NODE_ENV: "test", WORKDIR: root, USER_PLUGINS: join(root, "user-plugins"), PROCS_PATH: "", PROCS_PLUGINS: "" };
        await load(ctx, null, { strict: true });
        ctx.state.registry.runtime.docs.index = async () => ({});
        const fns = ctx.fns.models as typeof ctx.fns.models & {
            compatFacade: (opts: Record<string, unknown>) => Record<string, unknown>;
            compatMissing: (opts: Record<string, unknown>) => unknown;
        };
        expect(typeof fns.providers).toBe("function");
        expect(fns.providers({}).map(p => p.id).sort()).toEqual(["claude", "codex", "compat-fixture", "custom"]);
        // Baseline declarations are immutable object literals. Importing creates
        // callbacks but never invokes login, network, validation or usage operations.
        const registrationShape = (value: unknown): unknown => {
            if (typeof value === "function") return { callback: true };
            if (Array.isArray(value)) return value.map(registrationShape);
            if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, registrationShape(child)]));
            return value;
        };
        for (const [file, source] of Object.entries(baseline.declarations) as [string, string][]) {
            const snapshotPath = join(root, "baseline-declarations", file);
            await Bun.write(snapshotPath, source);
            const original = (await import(snapshotPath)).default as types.models.ProviderDefinition;
            const current = ctx.state.models.providers![original.id]!.definition;
            // Compares every metadata member, nested schema/default, action label
            // and callback presence without comparing intentional body changes.
            const expectedInference = original.id === "claude"
                ? { systemPreamble: "You are Claude Code, Anthropic's official CLI for Claude.", priceVendor: "anthropic" }
                : original.id === "codex" ? { priceVendor: "openai" } : undefined;
            expect(current.inference).toEqual(expectedInference);
            // custom gained a declared icon so every registered provider has a mark.
            const iconPatch = original.id === "custom" ? { icon: undefined } : {};
            if (original.id === "custom") expect(current.icon).toBe("Plug");
            expect(registrationShape({ ...current, ...(expectedInference ? { inference: undefined } : {}), ...iconPatch }), file).toEqual(registrationShape({ ...original, ...(expectedInference ? { inference: undefined } : {}), ...iconPatch }));
        }
        // Inspect real public facades and declaration bodies as they migrate. Every
        // nested implementation dispatch must exist in the freshly booted registry.
        for (const file of [...Object.keys(baseline.procedures).map(name => `${name}.ts`), ...Object.keys(baseline.declarations)]) {
            const source = await readFile(join(import.meta.dir, file), "utf8");
            const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
            const visit = (node: ts.Node): void => {
                if (ts.isCallExpression(node)) {
                    const expression = node.expression.getText(sf);
                    if (/^ctx\.fns\.models\.(provider|transport|catalog|connections|inference|protocol)\./.test(expression)) {
                        let value: unknown = ctx.state.registry;
                        for (const part of expression.slice("ctx.fns.".length).split(".")) value = (value as Record<string, unknown>)?.[part];
                        expect(typeof value, `${file}: ${expression}`).toBe("function");
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(sf);
        }
        const names = (await ctx.fns.procs.project.scan({})).filter(e => e.kind === "fn").map(e => `${e.moduleDir.replaceAll("/", ".")}.${e.runtimeName}`);
        const assertNoCollision = (paths: string[]) => {
            for (const path of paths) if (paths.some(other => other.startsWith(`${path}.`))) throw new Error(`callable namespace collision: ${path}`);
        };
        expect(() => assertNoCollision(names)).not.toThrow();
        // Negative control: the historically tempting plural directory is unsafe.
        expect(() => assertNoCollision([...names, "models.providers.codex.operation"])).toThrow("callable namespace collision: models.providers");
        const signal = new AbortController().signal;
        let observed: unknown;
        const opts = { signal, callback: (value: unknown) => { observed = value; } };
        expect(fns.compatFacade(opts)).toBe(opts);
        expect(observed).toBe(signal);
        const error = new Error("same failure identity");
        try { fns.compatFacade({ error }); throw new Error("expected fixture failure"); } catch (caught) { expect(caught).toBe(error); }
        expect(() => fns.compatMissing({})).toThrow();
        await Bun.write(leaf, 'export default function(ctx, session, opts) { return { version: 2, opts }; }');
        await ctx.fns.procs.repl.load({ name: "models.provider.codex.compatFixture" });
        expect(fns.compatFacade(opts)).toEqual({ version: 2, opts });
        await Bun.write(leaf, 'export default function(ctx, session, opts) { return { version: 3, opts }; }');
        await ctx.fns.procs.repl.load({ name: "models/provider/codex" });
        expect(fns.compatFacade(opts)).toEqual({ version: 3, opts });
        const declaration = ctx.state.models.providers!["compat-fixture"]!.definition;
        const connection = { id: "fixture" } as types.models.ResolvedConnection;
        expect<unknown>(await declaration.test(ctx, connection)).toEqual({ version: 3, opts: connection });
        await ctx.fns.procs.repl.load({ name: "compatOwner" });
        expect<unknown>(await ctx.state.models.providers!["compat-fixture"]!.definition.test(ctx, connection)).toEqual({ version: 3, opts: connection });
        expect(typeof fns.providers).toBe("function");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}, 30_000);
