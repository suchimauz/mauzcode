// Regression: real scan, boot loader table and hot reload, not a hand-built registry or a direct loader call.
// A voice provider declaration must follow its files through boot and namespace reload, and one broken
// declaration must not stop a good one from registering in the same pass.
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { makeCtx } from "../$main";
import load, { apply } from "../procs/boot/load";
import discover from "../procs/modules/discover";
import scan from "../procs/project/scan";

function declaration(label: string, updated = false): string {
    return `export default {
        id: "reload-fixture", label: ${JSON.stringify(label)},
        destination: { kind: "cloud", label: ${JSON.stringify(updated ? "Fixture (v2)" : "Fixture")} },
        fields: [{ key: "token", label: "Token", type: "secret", required: true }],
        models: [{ id: "fixture-live", capabilities: { turnDetection: ${JSON.stringify(updated ? "server" : "client")}, sampleRates: [24000] } }],
        test: async () => { throw new Error("Fixture handlers must never run"); },
        open: async () => { throw new Error("Fixture handlers must never run"); }
    };\n`;
}

test("real boot discovers voiceProvider, isolates a broken file and namespace reload replaces the declaration", async () => {
    const scratch = resolve(import.meta.dir, "../../.test-tmp");
    await mkdir(scratch, { recursive: true });
    const root = await mkdtemp(join(scratch, "voice-provider-reload-"));
    try {
        await Bun.write(join(root, "package.json"), JSON.stringify({ name: "voice-fixture", procs: { path: [], plugins: [], prod: {} } }));
        await Bun.write(join(root, "workspace.json"), JSON.stringify({ pluginRegistry: { version: 1, entries: [] } }));
        const file = join(root, "src/reloadFixture/$voiceProvider_reload-fixture.ts");
        const broken = join(root, "src/reloadFixture/$voiceProvider_broken-fixture.ts");
        await Bun.write(file, declaration("Before reload"));
        // A declaration that is invalid in a way only runtime validation can see (no TS check in this project).
        await Bun.write(broken, `export default { id: "broken-fixture", label: "Broken" };\n`);
        const ctx = makeCtx();
        ctx.state.root = root;
        ctx.env = { NODE_ENV: "test", WORKDIR: root, USER_PLUGINS: join(root, "user-plugins"), PROCS_PATH: "", PROCS_PLUGINS: "" };
        await load(ctx, null, { strict: true });
        // Documentation indexing is unrelated to provider reload and requires a DB.
        ctx.state.registry.runtime.docs.index = async () => ({});

        const providers = () => ctx.state.voice?.providers ?? {};
        const builtin = providers()["openai-realtime"];
        expect(builtin).toMatchObject({ owner: "core", rel: "voice/$voiceProvider_openai-realtime.ts" });
        const before = providers()["reload-fixture"];
        expect(before?.definition.label).toBe("Before reload");
        expect(before?.definition.destination).toEqual({ kind: "cloud", label: "Fixture" });
        expect(before?.rel).toBe("reloadFixture/$voiceProvider_reload-fixture.ts");
        expect(before?.module).toBe("reloadFixture");
        // The broken file was rejected by validation and did not take the good one with it.
        expect(providers()["broken-fixture"]).toBeUndefined();
        expect(Object.keys(providers()).sort()).toEqual(["openai-realtime", "reload-fixture"]);

        await Bun.write(file, declaration("After reload", true));
        const reloaded = await ctx.fns.procs.repl.load({ name: "reloadFixture" });
        expect("files" in reloaded ? reloaded.files : []).toContain("reloadFixture/$voiceProvider_reload-fixture.ts");
        const after = providers()["reload-fixture"];
        expect(after?.definition.label).toBe("After reload");
        expect(after?.definition.destination).toEqual({ kind: "cloud", label: "Fixture (v2)" });
        expect(after?.owner).toBe(before!.owner);
        expect(after?.rel).toBe(before!.rel);
        expect(after?.definition).not.toBe(before!.definition);
        expect(providers()["openai-realtime"]).toBe(builtin);
        expect(Object.keys(providers()).sort()).toEqual(["openai-realtime", "reload-fixture"]);
        expect(JSON.stringify({ ...after, definition: after!.definition.label })).not.toContain("Fixture handlers");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}, 60_000);

// Regression: the real Phase C boot pass skipped the loader entirely once no voiceProvider file was
// left, so deleting the last declaration or unmounting its plugin left a stale entry until restart.
// Also: Phase A pre-imports declarations, and a file that throws at import time must be reported
// with a fixed reason — its thrown text never reaches the log or the registry.
test("a real re-boot after the last declaration disappears unloads it, and a broken file leaks no error text", async () => {
    const scratch = resolve(import.meta.dir, "../../.test-tmp");
    await mkdir(scratch, { recursive: true });
    const root = await mkdtemp(join(scratch, "voice-provider-unload-"));
    // Thrown by the broken declaration at import time; must never reach a log line or registry state.
    const marker = "SECRET-CANARY-voice-unload";
    try {
        await Bun.write(join(root, "package.json"), JSON.stringify({ name: "voice-fixture", procs: { path: [], plugins: [], prod: {} } }));
        await Bun.write(join(root, "workspace.json"), JSON.stringify({ pluginRegistry: { version: 1, entries: [] } }));
        const dir = join(root, "src/unloadFixture");
        await mkdir(dir, { recursive: true });
        const good = join(dir, "$voiceProvider_reload-fixture.ts");
        const broken = join(dir, "$voiceProvider_broken-unload.ts");
        await Bun.write(good, declaration("Unload fixture"));
        await Bun.write(broken, `throw new Error("${marker}: key http://user:pass@host");\n`);
        const ctx = makeCtx();
        ctx.state.root = root;
        ctx.env = { NODE_ENV: "test", WORKDIR: root, USER_PLUGINS: join(root, "user-plugins"), PROCS_PATH: "", PROCS_PLUGINS: "" };
        // Documentation indexing is unrelated to provider unload and requires a DB.
        ctx.state.registry.runtime = { docs: { index: async () => ({}) } };
        const fixtureSrc = join(root, "src");
        // Keep the real scan and boot apply pipeline, but scope this fixture's voice declarations to its
        // own root. The core loader stays mounted; neither the builtin nor the live checkout is changed.
        const bootFixture = async (strict = false) => {
            const entries = (await scan(ctx, null, {})).filter(entry => entry.kind !== "voiceProvider" || entry.rootDir === fixtureSrc);
            await apply(ctx, entries, await discover(ctx, null, {}), { strict });
        };
        const voiceDeclarations = () => (ctx.state.procs.boot.entries ?? []).filter(entry => entry.kind === "voiceProvider").map(entry => entry.abs);
        const lines: string[] = [];
        const realError = console.error, realWarn = console.warn;
        console.error = (line: unknown) => { lines.push(String(line)); };
        console.warn = (line: unknown) => { lines.push(String(line)); };
        try {
            // Strict mode reports import failures to its caller; it must not leak the thrown payload either.
            await expect(bootFixture(true)).rejects.toThrow(
                /^\[load\] unloadFixture\/\$voiceProvider_broken-unload\.ts: declaration failed to import$/,
            );
            await bootFixture();
        } finally {
            console.error = realError;
            console.warn = realWarn;
        }
        // The broken file was isolated: the good provider registered, the log names the file with a
        // fixed reason, and the thrown marker reached neither the log nor the registry.
        expect(Object.keys(ctx.state.voice?.providers ?? {})).toEqual(["reload-fixture"]);
        const logged = lines.join("\n");
        expect(logged).toContain("broken-unload");
        expect(logged).toContain("declaration failed to import");
        expect(logged).not.toContain(marker);
        expect(JSON.stringify(ctx.state.voice)).not.toContain(marker);

        await rm(broken);
        await bootFixture(true);
        expect(voiceDeclarations()).toEqual([good]);
        const owner = ctx.state.voice?.providers?.["reload-fixture"]?.owner;
        expect(owner).toBeDefined();

        // The last declaration disappears while its owner stays mounted. Phase C must call the loader
        // with an empty batch, not wait for a restart or drop the provider because its owner unmounted.
        await rm(good);
        await bootFixture(true);
        expect(voiceDeclarations()).toEqual([]);
        expect(ctx.state.procs.modules?.map(module => module.name)).toContain(owner!);
        expect(ctx.state.voice?.providers ?? {}).toEqual({});
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}, 120_000);
