// Migration regression for models-protocol-strategies: a runtime that loaded the old
// root forwarding procedures and the provider-local custom protocol drops them after
// source removal, exact-directory reload and the supported unload operation, without
// a restart. Uses the real scanner, boot loader, injecting proxy and procs.repl.unload.
// Provider-declaration reload coverage stays separately in registryReload.test.ts.
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { makeCtx } from "../$main";
import load from "../procs/boot/load";

const removedRoot = ["assertModelEnabled", "cached", "checkInput", "claudeAuth", "claudeLogin", "claudeRequest", "codexAuth", "codexFailure", "codexInput", "codexLogin", "codexQuota", "codexReasoningProfile", "codexVersion", "customProtocol", "failure", "fetch", "parseSSE", "resolveReasoning", "resolve", "safeMessage", "toView", "validateConfig", "validateTransport"];
const removed = [...removedRoot.map(name => `models.${name}`), "models.provider.custom.customProtocol"];
const facade = ["action", "api", "compact", "create", "get", "list", "listModels", "providers", "refreshAll", "remove", "setModelEnabled", "stream", "test", "update", "usage"];

async function boot(root: string) {
    const ctx = makeCtx();
    ctx.state.root = root;
    ctx.env = { NODE_ENV: "test", WORKDIR: root, USER_PLUGINS: join(root, "user-plugins"), PROCS_PATH: "", PROCS_PLUGINS: "" };
    await load(ctx, null, { strict: true });
    // Documentation indexing needs a DB and is unrelated to registry contents.
    ctx.state.registry.runtime.docs.index = async () => ({});
    return ctx;
}
const lookup = (ctx: Context, name: string): unknown => {
    let value: unknown = ctx.state.registry;
    for (const part of name.split(".")) value = (value as Record<string, unknown> | undefined)?.[part];
    return value;
};
const modelNames = (ctx: Context): string[] => {
    const names: string[] = [];
    const walk = (node: Record<string, unknown>, path: string) => {
        for (const [key, value] of Object.entries(node)) {
            if (typeof value === "function") names.push(`${path}.${key}`);
            else if (value && typeof value === "object") walk(value as Record<string, unknown>, `${path}.${key}`);
        }
    };
    walk(ctx.state.registry.models as Record<string, unknown>, "models");
    return names.sort();
};

test("live removal of root forwarders and customProtocol matches a fresh boot and reaches shared protocols", async () => {
    const scratch = resolve(import.meta.dir, "../../.test-tmp/model-facade-removal");
    await mkdir(scratch, { recursive: true });
    const oldRoot = await mkdtemp(join(scratch, "old-"));
    const freshRoot = await mkdtemp(join(scratch, "fresh-"));
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: req => {
        const path = new URL(req.url).pathname;
        return path === "/v1/models" ? Response.json({ data: [{ id: "mock" }] }) : Response.json({}, { status: 404 });
    } });
    try {
        for (const root of [oldRoot, freshRoot]) {
            await Bun.write(join(root, "package.json"), JSON.stringify({ name: "models-facade-removal", procs: { path: [], plugins: [], prod: {} } }));
            await Bun.write(join(root, "workspace.json"), JSON.stringify({ pluginRegistry: { version: 1, entries: [] } }));
        }
        // Old sources: forwarding procedures in the former shape, never invoked here.
        const oldFiles = [
            ...removedRoot.map(name => join(oldRoot, `src/models/${name}.ts`)),
            join(oldRoot, "src/models/provider/custom/customProtocol.ts"),
        ];
        for (const file of oldFiles) await Bun.write(file, 'export default async function(ctx, session, opts) { throw new Error("old procedure must not run"); }');

        const fresh = await boot(freshRoot);
        const ctx = await boot(oldRoot);
        for (const name of removed) expect(typeof lookup(ctx, name), name).toBe("function");

        // Remove the sources, reload the exact changed directories, then unload.
        for (const file of oldFiles) await rm(file);
        for (const name of ["models/provider/custom", "models"]) await ctx.fns.procs.repl.load({ name });
        for (const name of removed) expect((await ctx.fns.procs.repl.unload({ name })).name).toBe(name);
        // Idempotent for already absent entries.
        expect((await ctx.fns.procs.repl.unload({ name: "models.fetch" })).removed).toBe(false);

        for (const name of removed) expect(lookup(ctx, name), name).toBeUndefined();
        for (const name of facade) expect(typeof lookup(ctx, `models.${name}`), name).toBe("function");
        const rootProcedures = Object.entries(ctx.state.registry.models as Record<string, unknown>).filter(([, v]) => typeof v === "function").map(([k]) => k).sort();
        expect(rootProcedures).toEqual([...facade].sort());
        expect(modelNames(ctx)).toEqual(modelNames(fresh));

        // Custom discovery and probing reach the shared protocol implementations.
        const reached: string[] = [];
        const original = ctx.state.registry.models.protocol.openaiChat.listModels;
        ctx.state.registry.models.protocol.openaiChat.listModels = (...args: Parameters<typeof original>) => { reached.push("listModels"); return original(...args); };
        const conn: types.models.ResolvedConnection = {
            id: "fixture", provider: "custom", accountName: "fixture", config: { baseUrl: server.url.origin + "/v1", protocol: "openai-chat" },
            secret: async () => null, fetch: (url, init) => fetch(url, init),
        };
        const custom = ctx.state.models.providers!.custom!.definition;
        expect(await custom.listModels!(ctx, conn)).toEqual([{ id: "mock" }]);
        expect(await custom.test(ctx, conn)).toMatchObject({ status: "available", reason: "models-ok" });
        expect(await custom.test(ctx, { ...conn, config: { ...conn.config, testModel: "mock" } })).toMatchObject({ status: "unavailable", reason: "generation-failed" });
        expect(reached).toEqual(["listModels", "listModels", "listModels"]);
    } finally {
        server.stop(true);
        await rm(oldRoot, { recursive: true, force: true });
        await rm(freshRoot, { recursive: true, force: true });
    }
}, 60_000);
