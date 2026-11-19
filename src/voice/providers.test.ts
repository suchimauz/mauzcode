import { describe, expect, test } from "bun:test";
import load from "./$loader_voiceProvider";
import classify from "../procs/project/classify";

// A minimal but complete declaration: destination, one secret field, one model with both segmentation modes.
const definition = (id = "acme-voice"): types.voice.ProviderDefinition => ({
    id,
    label: "Acme Voice",
    description: "Fixture recognizer",
    destination: { kind: "cloud", label: "Acme (acme.invalid)" },
    fields: [
        { key: "apiKey", label: "API key", type: "secret", required: true },
        { key: "baseUrl", label: "Base URL", type: "url", default: "https://acme.invalid/v1" },
    ],
    models: [{
        id: "acme-live",
        label: "Acme Live",
        capabilities: { turnDetection: "client", sampleRates: [24000], languages: true, keywords: true, prompt: true, delay: true },
    }],
    test: async () => ({ status: "configured", reason: "fixture", message: "Fixture only", checkedAt: 1 }),
    open: async () => ({
        append: async () => {},
        commit: async () => {},
        finish: async () => {},
        cancel: async () => {},
    }),
});

function entry(root = "alpha", name = "acme-voice", def: unknown = definition(name)) {
    return {
        kind: "voiceProvider", root, rootDir: `/mounted/${root}/src`,
        abs: `/mounted/${root}/src/voice/$voiceProvider_${name}.ts`,
        rel: `voice/$voiceProvider_${name}.ts`, moduleDir: "voice", name, mod: { default: def },
    };
}

function fixture(entries: ReturnType<typeof entry>[] = [], roots = ["core", "alpha", "beta"]) {
    const warnings: string[] = [];
    return {
        state: { voice: {} as types.voice.State, procs: { boot: { entries } } },
        warnings,
        fns: {
            procs: {
                modules: { list: () => roots.map(name => ({ name, dir: `/mounted/${name}` })) },
                log: { debug() {}, warn: (record: { event: string; msg: string }) => { warnings.push(record.msg); } },
            },
        },
    };
}

const register = (ctx: ReturnType<typeof fixture>, ...entries: Parameters<typeof load>[2]["entries"]) =>
    load(ctx as unknown as Context, null, { entries });
const providers = (ctx: ReturnType<typeof fixture>) => Object.keys(ctx.state.voice.providers ?? {}).sort();

describe("voice provider declarations and registry", () => {
    test("camelCase declarations are a kind, not runtime functions", () => {
        const ctx = {} as Context;
        expect(classify(ctx, null, { rel: "voice/$voiceProvider_acme-voice.ts" })).toMatchObject({ kind: "voiceProvider", name: "acme-voice" });
        expect(classify(ctx, null, { rel: "voice/$loader_voiceProvider.ts" })).toMatchObject({ kind: "loader", loaderKind: "voiceProvider" });
    });

    test("a fixture provider registers for any mounted owner and keeps its declaration", async () => {
        for (const owner of ["core", "alpha", "beta"]) {
            const ctx = fixture();
            expect(await register(ctx, entry(owner))).toEqual({ registered: ["acme-voice"], rejected: [] });
            const record = ctx.state.voice.providers?.["acme-voice"];
            expect(record?.owner).toBe(owner);
            expect(record?.module).toBe("voice");
            expect(record?.definition.destination).toEqual({ kind: "cloud", label: "Acme (acme.invalid)" });
            // The declaration object is kept, not a copy: providers are called through it.
            expect(record?.definition.open).toBeTypeOf("function");
        }
    });

    test("providers without a mounted source owner are rejected", async () => {
        const ctx = fixture();
        const orphan = { ...entry(), root: undefined, rootDir: undefined };
        const result = await register(ctx, orphan);
        expect(result.registered).toEqual([]);
        expect(result.rejected[0]?.message).toBe("voiceProvider requires a mounted source owner");
        expect(providers(ctx)).toEqual([]);
    });

    test("a broken declaration is rejected while a good one in the same batch still registers", async () => {
        const broken = { ...definition("broken-voice"), destination: undefined };
        const ctx = fixture();
        const result = await register(ctx, entry("alpha", "broken-voice", broken), entry("alpha"));
        expect(result.registered).toEqual(["acme-voice"]);
        expect(result.rejected).toEqual([{
            rel: "voice/$voiceProvider_broken-voice.ts",
            message: "voiceProvider requires a destination with a cloud or host kind and a nonblank label",
        }]);
        expect(providers(ctx)).toEqual(["acme-voice"]);
        // The rejection is reported, never silent: a diagnostic names the file and the rule.
        expect(ctx.warnings[0]).toContain("voice/$voiceProvider_broken-voice.ts");
    });

    test("a declaration that cannot be imported is isolated too", async () => {
        const ctx = fixture();
        const missing = { ...entry("alpha", "ghost-voice"), mod: undefined, abs: "/mounted/alpha/src/voice/$voiceProvider_ghost-voice.ts" };
        const result = await register(ctx, missing, entry("alpha"));
        expect(result.registered).toEqual(["acme-voice"]);
        expect(result.rejected).toHaveLength(1);
        // The fixed reason only: the raw import error (paths, thrown text) never reaches a diagnostic.
        expect(result.rejected[0]?.message).toBe("voiceProvider declaration failed to import");
    });

    test("declaration id must be kebab-case and match the filename", async () => {
        const ctx = fixture();
        expect((await register(ctx, entry("alpha", "Bad_Id"))).rejected[0]?.message).toBe("voiceProvider id must be lowercase kebab-case");
        const mismatched = fixture();
        expect((await register(mismatched, entry("alpha", "acme-voice", definition("other")))).rejected[0]?.message)
            .toBe("voiceProvider definition id must match its filename");
        // A default export that is not an object at all is refused by the same path.
        const notAnObject = fixture();
        expect((await register(notAnObject, entry("alpha", "acme-voice", null))).rejected[0]?.message)
            .toBe("voiceProvider must default-export a definition object");
        expect(providers(ctx)).toEqual([]);
    });

    test("field schema rules reject secrets with defaults and unsafe keys", async () => {
        const withDefault = { ...definition(), fields: [{ key: "apiKey", label: "Key", type: "secret", default: "leak" }] };
        const unsafeKey = { ...definition(), fields: [{ key: "__proto__", label: "Proto", type: "text" }] };
        const badSelect = { ...definition(), fields: [{ key: "mode", label: "Mode", type: "select", options: [{ value: "a", label: "A" }, { value: "a", label: "B" }] }] };
        const ctx = fixture();
        const result = await register(ctx, entry("alpha", "acme-voice", withDefault), entry("alpha", "acme-voice", unsafeKey), entry("alpha", "acme-voice", badSelect));
        expect(result.registered).toEqual([]);
        expect(result.rejected.map(r => r.message)).toEqual([
            "voiceProvider secret fields must not declare defaults",
            "voiceProvider field keys must be safe and unique",
            "voiceProvider select field requires unique value/label options",
        ]);
    });

    test("model capabilities must be known, complete and unique", async () => {
        const noRates = { ...definition(), models: [{ id: "m", capabilities: { turnDetection: "client" } }] };
        const extraFlag = { ...definition(), models: [{ id: "m", capabilities: { turnDetection: "client", sampleRates: [16000], diarization: true } }] };
        const duplicate = { ...definition(), models: [{ id: "m", capabilities: { turnDetection: "client", sampleRates: [16000] } }, { id: "m", capabilities: { turnDetection: "client", sampleRates: [16000] } }] };
        const badTurn = { ...definition(), models: [{ id: "m", capabilities: { turnDetection: "auto", sampleRates: [16000] } }] };
        const ctx = fixture();
        const result = await register(ctx,
            entry("alpha", "acme-voice", noRates), entry("alpha", "acme-voice", extraFlag),
            entry("alpha", "acme-voice", duplicate), entry("alpha", "acme-voice", badTurn));
        expect(result.rejected.map(r => r.message)).toEqual([
            "voiceProvider model requires unique positive integer sample rates",
            "voiceProvider model capabilities must be known flags",
            "voiceProvider model ids must be unique",
            "voiceProvider model turnDetection must be client or server",
        ]);
    });

    test("a model discovery operation stands in for or adds to the static list", async () => {
        const ctx = fixture();
        const discovered = {
            ...definition(), models: undefined, listModels: async () => [{
                id: "live", capabilities: { turnDetection: "server" as const, sampleRates: [16000] },
            }],
        };
        expect((await register(ctx, entry("alpha", "acme-voice", discovered))).registered).toEqual(["acme-voice"]);
        // Neither a catalogue nor discovery leaves nothing selectable, and a non-function is not discovery.
        const neither = fixture();
        expect((await register(neither, entry("alpha", "acme-voice", { ...definition(), models: undefined }))).rejected[0]?.message)
            .toBe("voiceProvider requires a model list or a models operation");
        const notAFunction = fixture();
        expect((await register(notAFunction, entry("alpha", "acme-voice", { ...definition(), listModels: "nope" }))).rejected[0]?.message)
            .toBe("voiceProvider listModels must be a function");
    });

    test("duplicate ids are rejected: the first owner and the same file keep the id", async () => {
        const ctx = fixture();
        await register(ctx, entry("alpha"));
        const conflict = await register(ctx, entry("beta"));
        expect(conflict.registered).toEqual([]);
        expect(conflict.rejected[0]?.message).toBe("voiceProvider acme-voice already belongs to alpha (voice/$voiceProvider_acme-voice.ts)");
        expect(ctx.state.voice.providers?.["acme-voice"]?.owner).toBe("alpha");
        // Reloading the same file (hot reload, or a second boot pass) is not a duplicate.
        const reload = await register(ctx, entry("alpha"));
        expect(reload).toEqual({ registered: ["acme-voice"], rejected: [] });
        expect(ctx.state.voice.providers?.["acme-voice"]?.owner).toBe("alpha");
    });

    test("a rejected re-registration leaves the working declaration in place", async () => {
        const ctx = fixture();
        await register(ctx, entry("alpha"));
        const working = ctx.state.voice.providers?.["acme-voice"]?.definition;
        const broken = { ...definition(), label: "  " };
        const result = await register(ctx, entry("alpha", "acme-voice", broken));
        expect(result.rejected[0]?.message).toBe("voiceProvider requires a nonblank label");
        expect(ctx.state.voice.providers?.["acme-voice"]?.definition).toBe(working);
    });

    test("unmounting an owner unloads its providers", async () => {
        const ctx = fixture([], ["core", "alpha", "beta"]);
        await register(ctx, entry("alpha"));
        expect(providers(ctx)).toEqual(["acme-voice"]);
        // The same boot pass without alpha mounted: its declarations must be gone now, not at the next restart.
        const afterUnmount = fixture([], ["core", "beta"]);
        afterUnmount.state.voice = ctx.state.voice;
        afterUnmount.state.procs.boot.entries = ctx.state.procs.boot.entries;
        await register(afterUnmount, entry("beta", "beta-voice", definition("beta-voice")));
        expect(providers(afterUnmount)).toEqual(["beta-voice"]);
    });

    test("a full boot pass drops declarations whose files were deleted from a live owner", async () => {
        const ctx = fixture();
        const first = entry("alpha");
        const second = entry("alpha", "second-voice", definition("second-voice"));
        ctx.state.procs.boot.entries = [first, second];
        await register(ctx, first, second);
        expect(providers(ctx)).toEqual(["acme-voice", "second-voice"]);
        // The deleted file is absent from both the batch and the boot list.
        ctx.state.procs.boot.entries = [first];
        await register(ctx, first);
        expect(providers(ctx)).toEqual(["acme-voice"]);
    });

    test("a partial reload of one file never prunes other owners", async () => {
        const ctx = fixture();
        await register(ctx, entry("alpha"), entry("beta", "beta-voice", definition("beta-voice")));
        expect(providers(ctx)).toEqual(["acme-voice", "beta-voice"]);
        // One file changed: pruning would drop beta, which belongs to another mounted owner.
        await register(ctx, entry("alpha"));
        expect(providers(ctx)).toEqual(["acme-voice", "beta-voice"]);
    });

    test("an empty full boot pass unloads the last declarations", async () => {
        const ctx = fixture();
        await register(ctx, entry("alpha"), entry("beta", "beta-voice", definition("beta-voice")));
        expect(providers(ctx)).toEqual(["acme-voice", "beta-voice"]);
        // The last declaration disappeared (its file deleted, or its plugin unmounted): boot calls
        // the loader with no files, and the registry empties instead of going stale.
        ctx.state.procs.boot.entries = [];
        expect(await register(ctx)).toEqual({ registered: [], rejected: [] });
        expect(providers(ctx)).toEqual([]);
    });

    test("a batch whose files failed to import keeps the last working registration", async () => {
        const ctx = fixture();
        await register(ctx, entry("alpha"));
        // The boot list still declares the file, but its import failed, so it is missing from the
        // batch: not a full pass, and dropping a working provider would be the greater harm.
        const failed = { ...entry("alpha"), rel: "voice/$voiceProvider_missing.ts", mod: undefined, abs: "/mounted/alpha/src/voice/$voiceProvider_missing.ts" };
        const result = await register(ctx, failed);
        expect(result.registered).toEqual([]);
        expect(result.rejected).toEqual([{ rel: "voice/$voiceProvider_missing.ts", message: "voiceProvider declaration failed to import" }]);
        expect(providers(ctx)).toEqual(["acme-voice"]);
    });

    test("a throwing declaration is isolated with a fixed reason and leaks no thrown text", async () => {
        const marker = "SECRET-CANARY-connection-string";
        const trap = { id: "trap-voice", get label(): string { throw new Error(`${marker} at provider.label`); } };
        const ctx = fixture();
        const result = await register(ctx, entry("alpha", "trap-voice", trap), entry("alpha"));
        expect(result.registered).toEqual(["acme-voice"]);
        expect(result.rejected).toEqual([{ rel: "voice/$voiceProvider_trap-voice.ts", message: "voiceProvider declaration failed to load" }]);
        expect(providers(ctx)).toEqual(["acme-voice"]);
        // Neither the diagnostic nor the log record echoes the thrown text.
        expect(JSON.stringify(result)).not.toContain(marker);
        expect(JSON.stringify(ctx.warnings)).not.toContain(marker);
    });

    test("validating twice is idempotent and the returned diagnostics stay stable", async () => {
        const ctx = fixture();
        const broken = entry("alpha", "broken-voice", { ...definition("broken-voice"), test: undefined });
        const a = await register(ctx, entry("alpha"), broken);
        const b = await register(ctx, entry("alpha"), broken);
        expect(a).toEqual(b);
        expect(b.rejected[0]?.message).toBe("voiceProvider requires a test operation");
        expect(providers(ctx)).toEqual(["acme-voice"]);
    });
});
