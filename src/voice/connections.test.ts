import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

// A fixture recognizer: no network, no real key, no audio. The secret is a fixed fake value.
const KEY = "fixture-secret-value-0123456789";

type Calls = { test: number; open: number };

function definition(calls: Calls, extra: Partial<types.voice.ProviderDefinition> = {}): types.voice.ProviderDefinition {
    return {
        id: "acme-voice",
        label: "Acme Voice",
        description: "Fixture recognizer",
        destination: { kind: "cloud", label: "Acme (acme.invalid)" },
        fields: [
            { key: "apiKey", label: "API key", type: "secret", required: true },
            { key: "org", label: "Organization", type: "secret" },
            { key: "baseUrl", label: "Base URL", type: "url", default: "https://acme.invalid/v1" },
            { key: "language", label: "Language", type: "select", default: "en", options: [{ value: "en", label: "English" }, { value: "de", label: "German" }] },
            { key: "beta", label: "Beta", type: "boolean", default: false },
        ],
        models: [{ id: "acme-live", label: "Acme Live", capabilities: { turnDetection: "client", sampleRates: [24000] } }],
        test: async (_ctx, conn) => {
            calls.test++;
            const key = await conn.secret("apiKey");
            if (conn.config.baseUrl === "https://fail.example") throw new Error(`401 for key ${key}`);
            return { status: "available", reason: "voice-ok", message: "Fixture ready", checkedAt: 1 };
        },
        open: async () => {
            calls.open++;
            return { append: async () => {}, commit: async () => {}, finish: async () => {}, cancel: async () => {} };
        },
        ...extra,
    };
}

async function setup(extra: Partial<types.voice.ProviderDefinition> = {}) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString("base64") } });
    const calls: Calls = { test: 0, open: 0 };
    ctx.state.voice ??= {};
    ctx.state.voice.providers = {
        "acme-voice": { owner: "core", module: "voice", rel: "voice/$voiceProvider_acme-voice.ts", abs: "/app/src/voice/$voiceProvider_acme-voice.ts", definition: definition(calls, extra) },
    };
    const create = (over: Record<string, unknown> = {}) => ctx.fns.voice.create({ provider: "acme-voice", accountName: "work", config: { baseUrl: "https://acme.invalid/v1" }, secrets: { apiKey: KEY }, ...over });
    const secretRows = async (id: string) => (await ctx.fns.procs.db.select({ sql: "SELECT name FROM local_secrets WHERE namespace='voice' AND starts_with(name, ?) ORDER BY name", params: [`${id}.`] })).map((row: any) => row.name);
    return { ctx, calls, create, secretRows };
}

// The first test context builds the migrated template database; keep that out of per-test timeouts.
beforeAll(async () => { await mkTestCtx(); }, 60000);

const noSecrets = (value: unknown) => {
    const json = JSON.stringify(value);
    expect(json).not.toContain(KEY);
    expect(json).not.toContain("secret://");
    expect(json).not.toContain("fixture-secret-value");
    expect(json).not.toContain("org-fixture-value");
};

describe("voice connection validation", () => {
    test("unknown provider, unknown key, secret as config and bad values are rejected", async () => {
        const { ctx } = await setup();
        await expect(ctx.fns.voice.create({ provider: "nope", accountName: "a" })).rejects.toMatchObject({ code: "UNKNOWN_PROVIDER" });
        await expect(ctx.fns.voice.create({ provider: "acme-voice", accountName: "a", config: { nope: 1 } })).rejects.toMatchObject({ code: "VALIDATION", field: "nope" });
        await expect(ctx.fns.voice.create({ provider: "acme-voice", accountName: "a", config: { apiKey: KEY } })).rejects.toMatchObject({ field: "apiKey" });
        await expect(ctx.fns.voice.create({ provider: "acme-voice", accountName: "a", config: { language: "fr" } })).rejects.toMatchObject({ field: "language" });
        await expect(ctx.fns.voice.create({ provider: "acme-voice", accountName: "a", config: { baseUrl: "not a url" } })).rejects.toMatchObject({ field: "baseUrl" });
        await expect(ctx.fns.voice.create({ provider: "acme-voice", accountName: "a", config: { baseUrl: "ftp://acme.invalid" } })).rejects.toMatchObject({ field: "baseUrl" });
        await expect(ctx.fns.voice.create({ provider: "acme-voice", accountName: "a", config: { beta: "yes" } })).rejects.toMatchObject({ field: "beta" });
        await expect(ctx.fns.voice.create({ provider: "acme-voice", accountName: "" })).rejects.toMatchObject({ field: "accountName" });
        await expect(ctx.fns.voice.create({ provider: "acme-voice", accountName: "a/b" })).rejects.toMatchObject({ field: "accountName" });
        await expect(ctx.fns.voice.create({ provider: "acme-voice", accountName: "a" })).rejects.toMatchObject({ field: "apiKey" });
        await expect(ctx.fns.voice.create({ provider: "acme-voice", accountName: "a", secrets: { nope: "x" } })).rejects.toMatchObject({ field: "nope" });
        await expect(ctx.fns.voice.create({ provider: "acme-voice", accountName: "a", secrets: { apiKey: "" } })).rejects.toMatchObject({ field: "apiKey" });
    });

    test("configuration hooks cannot echo a submitted value in public validation errors", async () => {
        const marker = "synthetic-config-token";
        const { create } = await setup({
            validateConfig: config => {
                const submitted = String(config.baseUrl);
                expect(submitted).toContain(marker);
                // Simulate an untyped declaration returning both the old free-form message and an unknown reason.
                return { field: "baseUrl", message: submitted, reason: submitted } as unknown as
                    ReturnType<NonNullable<types.voice.ProviderDefinition["validateConfig"]>>;
            },
        });
        const error = await create({ config: { baseUrl: `https://acme.invalid/v1?token=${marker}` } }).catch((error: unknown) => error);
        expect(error).toMatchObject({ code: "VALIDATION", field: "baseUrl", message: "Invalid voice configuration value." });
        expect(String(error)).not.toContain(marker);
    });

    test("defaults are applied and unknown keys of the stored configuration stay out", async () => {
        const { ctx, create } = await setup();
        const created = await create({ config: {} });
        expect(created.config).toEqual({ baseUrl: "https://acme.invalid/v1", language: "en", beta: false });
    });
});

describe("voice connection CRUD", () => {
    test("create stores the row and the encrypted secret, and the projection is secret-free", async () => {
        const { ctx, create, secretRows } = await setup();
        const created = await create();
        expect(created).toMatchObject({ provider: "acme-voice", providerRegistered: true, accountName: "work", secrets: { apiKey: true, org: false } });
        expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
        noSecrets(created);
        expect(await secretRows(created.id)).toEqual([`${created.id}.apiKey`]);
        // The stored value is encrypted, never the plain fixture value.
        const row = (await ctx.fns.procs.db.select({ sql: "SELECT value_enc FROM local_secrets WHERE namespace='voice' AND name=?", params: [`${created.id}.apiKey`] }))[0];
        expect(String(row.value_enc)).not.toContain(KEY);
        expect(await ctx.fns.secrets.getLocal({ namespace: "voice", name: `${created.id}.apiKey` })).toBe(KEY);
        // The connection row stores presence only: no value, no reference.
        const stored = (await ctx.fns.procs.db.select({ sql: "SELECT secrets FROM voice_connections WHERE id=?", params: [created.id] }))[0];
        expect(JSON.stringify(stored.secrets)).toBe('{"apiKey":true}');
        expect(JSON.stringify(stored.secrets)).not.toContain("secret://");
        expect((await ctx.fns.voice.get({ id: created.id })).secrets).toEqual({ apiKey: true, org: false });
        expect((await ctx.fns.voice.list({})).map((entry: any) => entry.id)).toEqual([created.id]);
        expect((await ctx.fns.voice.list({ provider: "other" })).length).toBe(0);
        await expect(ctx.fns.voice.get({ id: crypto.randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(ctx.fns.voice.get({ id: "not-an-id" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    test("a duplicate account name is rejected and stores nothing", async () => {
        const { ctx, create } = await setup();
        await create();
        await expect(create()).rejects.toMatchObject({ code: "VALIDATION", field: "accountName" });
        expect((await ctx.fns.voice.list({})).length).toBe(1);
    });

    test("rename keeps the secrets, a duplicate name fails without changes", async () => {
        const { ctx, create, secretRows } = await setup();
        const created = await create();
        const renamed = await ctx.fns.voice.update({ id: created.id, accountName: "home" });
        expect(renamed.accountName).toBe("home");
        expect(renamed.updatedAt).toBeGreaterThan(created.updatedAt);
        expect(renamed.secrets).toEqual({ apiKey: true, org: false });
        expect(await secretRows(created.id)).toEqual([`${created.id}.apiKey`]);
        const other = await create({ accountName: "second" });
        await expect(ctx.fns.voice.update({ id: created.id, accountName: "second" })).rejects.toMatchObject({ field: "accountName" });
        expect((await ctx.fns.voice.get({ id: created.id })).accountName).toBe("home");
        expect((await ctx.fns.voice.get({ id: other.id })).accountName).toBe("second");
    });

    test("update changes the configuration, keeps omitted secrets, replaces given ones and clears on null", async () => {
        const { ctx, create, secretRows } = await setup();
        const created = await create({ secrets: { apiKey: KEY, org: "org-fixture-value" } });
        expect(created.secrets).toEqual({ apiKey: true, org: true });
        const changed = await ctx.fns.voice.update({ id: created.id, config: { baseUrl: "https://other.invalid/v1", language: "de" } });
        expect(changed.config).toEqual({ baseUrl: "https://other.invalid/v1", language: "de", beta: false });
        expect(changed.secrets).toEqual({ apiKey: true, org: true });
        expect(await ctx.fns.secrets.getLocal({ namespace: "voice", name: `${created.id}.apiKey` })).toBe(KEY);
        expect(await ctx.fns.secrets.getLocal({ namespace: "voice", name: `${created.id}.org` })).toBe("org-fixture-value");
        const replaced = await ctx.fns.voice.update({ id: created.id, secrets: { apiKey: "second-fixture-secret" } });
        expect(replaced.secrets).toEqual({ apiKey: true, org: true });
        expect(await ctx.fns.secrets.getLocal({ namespace: "voice", name: `${created.id}.apiKey` })).toBe("second-fixture-secret");
        // An omitted secret keeps its stored value.
        expect(await ctx.fns.secrets.getLocal({ namespace: "voice", name: `${created.id}.org` })).toBe("org-fixture-value");
        const cleared = await ctx.fns.voice.update({ id: created.id, secrets: { org: null } });
        expect(cleared.secrets).toEqual({ apiKey: true, org: false });
        expect(await secretRows(created.id)).toEqual([`${created.id}.apiKey`]);
        // A required secret cannot be cleared.
        await expect(ctx.fns.voice.update({ id: created.id, secrets: { apiKey: null } })).rejects.toMatchObject({ field: "apiKey" });
        expect(await ctx.fns.secrets.getLocal({ namespace: "voice", name: `${created.id}.apiKey` })).toBe("second-fixture-secret");
        await expect(ctx.fns.voice.update({ id: crypto.randomUUID(), accountName: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    test("a rename while the provider is unloaded keeps the stored configuration", async () => {
        const { ctx, create, secretRows } = await setup();
        const created = await create({ config: { language: "de" }, secrets: { apiKey: KEY, org: "org-fixture-value" } });
        expect(created.config).toEqual({ baseUrl: "https://acme.invalid/v1", language: "de", beta: false });
        const providers = ctx.state.voice.providers;
        // Unloaded provider: the projection of the stored configuration is empty.
        ctx.state.voice.providers = {};
        expect((await ctx.fns.voice.get({ id: created.id })).config).toEqual({});
        const renamed = await ctx.fns.voice.update({ id: created.id, accountName: "home" });
        expect(renamed.accountName).toBe("home");
        // Remount: neither configuration nor secret was lost.
        ctx.state.voice.providers = providers;
        expect(await ctx.fns.voice.get({ id: created.id })).toMatchObject({
            accountName: "home",
            config: { baseUrl: "https://acme.invalid/v1", language: "de", beta: false },
            secrets: { apiKey: true, org: true },
        });
        expect(await ctx.fns.secrets.getLocal({ namespace: "voice", name: `${created.id}.apiKey` })).toBe(KEY);
        expect(await ctx.fns.secrets.getLocal({ namespace: "voice", name: `${created.id}.org` })).toBe("org-fixture-value");
        expect(await secretRows(created.id)).toEqual([`${created.id}.apiKey`, `${created.id}.org`]);
    });

    test("a secret-only update leaves the stored configuration byte for byte", async () => {
        const { ctx, create } = await setup();
        const created = await create({ config: { language: "de" } });
        const stored = async () => JSON.stringify((await ctx.fns.procs.db.select({ sql: "SELECT config FROM voice_connections WHERE id=?", params: [created.id] }))[0].config);
        const before = await stored();
        const changed = await ctx.fns.voice.update({ id: created.id, secrets: { apiKey: "second-fixture-secret" } });
        expect(await stored()).toBe(before);
        expect(changed.config).toEqual({ baseUrl: "https://acme.invalid/v1", language: "de", beta: false });
        expect(await ctx.fns.secrets.getLocal({ namespace: "voice", name: `${created.id}.apiKey` })).toBe("second-fixture-secret");
    });

    test("a concurrent rename and reconfiguration both survive", async () => {
        const { ctx, create } = await setup();
        const created = await create({ config: { language: "de" } });
        const [renamed, reconfigured] = await Promise.all([
            ctx.fns.voice.update({ id: created.id, accountName: "home" }),
            ctx.fns.voice.update({ id: created.id, config: { baseUrl: "https://other.invalid/v1", language: "en" } }),
        ]);
        expect(renamed.accountName).toBe("home");
        expect(reconfigured.config).toEqual({ baseUrl: "https://other.invalid/v1", language: "en", beta: false });
        expect(await ctx.fns.voice.get({ id: created.id })).toMatchObject({
            accountName: "home",
            config: { baseUrl: "https://other.invalid/v1", language: "en", beta: false },
        });
    });

    test("remove deletes the row and every secret it owns, other connections survive", async () => {
        const { ctx, create, secretRows } = await setup();
        const created = await create();
        const other = await create({ accountName: "second" });
        expect(await ctx.fns.voice.remove({ id: created.id })).toEqual({ removed: created.id });
        expect(await secretRows(created.id)).toEqual([]);
        expect(await secretRows(other.id)).toEqual([`${other.id}.apiKey`]);
        expect((await ctx.fns.voice.list({})).map((entry: any) => entry.id)).toEqual([other.id]);
        await expect(ctx.fns.voice.remove({ id: created.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    test("a connection of an unregistered provider is listed but marked as not registered", async () => {
        const { ctx, create } = await setup();
        const created = await create();
        ctx.state.voice.providers = {};
        const view = await ctx.fns.voice.get({ id: created.id });
        expect(view.providerRegistered).toBe(false);
        // The value is still stored, so it is still reported as present — but never as a value.
        expect(view.secrets).toEqual({ apiKey: true });
        // Without a schema nothing can be safely projected as configuration.
        expect(view.config).toEqual({});
    });

    test("a field that became secret after a schema reload is never projected as configuration", async () => {
        const { ctx, create } = await setup();
        const created = await create();
        expect(created.config.baseUrl).toBe("https://acme.invalid/v1");
        // The provider changes the field type while the connection keeps the stored plain value.
        const entry = ctx.state.voice.providers!["acme-voice"]!;
        entry.definition = {
            ...entry.definition,
            fields: entry.definition.fields.map((field: any) => field.key === "baseUrl" ? { ...field, type: "secret" as const } : field),
        };
        const view = await ctx.fns.voice.get({ id: created.id });
        expect(view.config.baseUrl).toBeUndefined();
        expect(view.secrets.baseUrl).toBe(false);
        noSecrets(view);
    });
});

describe("voice connection test", () => {
    test("the provider check runs without audio and returns a safe result", async () => {
        const { ctx, calls, create } = await setup();
        const created = await create();
        const result = await ctx.fns.voice.test({ id: created.id });
        expect(result).toMatchObject({ status: "available", reason: "voice-ok", message: "Voice connection is ready" });
        expect(calls.test).toBe(1);
        expect(calls.open).toBe(0);
        noSecrets(result);
    });

    test("a provider failure becomes unavailable and the secret never reaches the message", async () => {
        const { ctx, create } = await setup();
        const created = await create({ config: { baseUrl: "https://fail.example" } });
        const result = await ctx.fns.voice.test({ id: created.id });
        expect(result.status).toBe("unavailable");
        expect(result.reason).toBe("test-failed");
        expect(result.message).toBe("Voice connection check failed");
        expect(result.message).not.toContain(KEY);
        noSecrets(result);
    });

    test("provider text never reaches the public result, not even a short secret", async () => {
        // A provider that echoes the credential — even a one-character one — must not change the public result.
        const { ctx, create } = await setup({
            test: async (_ctx, conn) => {
                const key = await conn.secret("apiKey");
                return { status: "unavailable" as const, reason: `bad-key ${key}`, message: `401 for ${key}`, checkedAt: 1 };
            },
        });
        const created = await create({ secrets: { apiKey: "k" } });
        const result = await ctx.fns.voice.test({ id: created.id });
        expect(result).toEqual({ status: "unavailable", reason: "check-failed", message: "Voice connection check failed", checkedAt: expect.any(Number) });
        expect(JSON.stringify(result)).not.toContain("bad-key");
    });

    test("a reason that is the alphanumeric secret never becomes public", async () => {
        // The secret is lowercase alphanumeric, so a shape check on a "code" would let it through; only the
        // closed local set of reasons may be published, everything else falls back to the status default.
        const secret = "ab12cd34ef56";
        const { ctx, create } = await setup({
            test: async (_ctx, conn) => ({ status: "unavailable" as const, reason: String(await conn.secret("apiKey")), message: "fixture", checkedAt: 1 }),
        });
        const created = await create({ secrets: { apiKey: secret } });
        const result = await ctx.fns.voice.test({ id: created.id });
        expect(result).toMatchObject({ status: "unavailable", reason: "check-failed", message: "Voice connection check failed" });
        expect(JSON.stringify(result)).not.toContain(secret);
        noSecrets(result);
        // An invented word under another status falls back to that status's own default.
        const other = await setup({ test: async () => ({ status: "available" as const, reason: "some-vendor-code-x", message: "fine", checkedAt: 1 }) });
        const otherCreated = await other.create({ accountName: "second-acme" });
        expect(await other.ctx.fns.voice.test({ id: otherCreated.id })).toMatchObject({ status: "available", reason: "available", message: "Voice connection is ready" });
    });

    test("a provider that ignores the abort signal is still cut off at the deadline", async () => {
        // Never settles and never looks at conn.signal: the deadline must end the check on its own.
        const { ctx, create } = await setup({ test: () => new Promise<never>(() => {}) });
        const created = await create();
        const started = Date.now();
        const result = await ctx.fns.voice.test({ id: created.id, timeoutMs: 100 });
        const elapsed = Date.now() - started;
        expect(result).toMatchObject({ status: "unavailable", reason: "timeout", message: "Voice connection check failed" });
        expect(elapsed).toBeGreaterThanOrEqual(90);
        expect(elapsed).toBeLessThan(5000);
        noSecrets(result);
    });

    test("a late rejection after the deadline is discarded, not reported and not unhandled", async () => {
        const { ctx, create } = await setup({
            test: async () => {
                await Bun.sleep(150);
                throw new Error(`late failure for ${KEY}`);
            },
        });
        const created = await create();
        const result = await ctx.fns.voice.test({ id: created.id, timeoutMs: 100 });
        expect(result).toMatchObject({ status: "unavailable", reason: "timeout" });
        // Let the late rejection happen inside the test: it is swallowed, reported nowhere and stays handled.
        await Bun.sleep(200);
        noSecrets(result);
    });

    test("a malformed provider result becomes unavailable", async () => {
        const { ctx, create } = await setup({ test: async () => ({ status: "weird", reason: "x" } as any) });
        const created = await create();
        const result = await ctx.fns.voice.test({ id: created.id });
        expect(result).toMatchObject({ status: "unavailable", reason: "test-failed" });
        noSecrets(result);
    });

    test("an unregistered provider is reported without calling it", async () => {
        const { ctx, calls, create } = await setup();
        const created = await create();
        ctx.state.voice.providers = {};
        const result = await ctx.fns.voice.test({ id: created.id });
        expect(result).toMatchObject({ status: "unavailable", reason: "unknown-provider" });
        expect(calls.test).toBe(0);
    });
});

describe("voice provider catalogue", () => {
    test("the catalogue is secret-free and describes destination, fields and models", async () => {
        const { ctx } = await setup();
        const providers = ctx.fns.voice.providers({});
        expect(providers).toHaveLength(1);
        expect(providers[0]).toMatchObject({ id: "acme-voice", label: "Acme Voice", destination: { kind: "cloud", label: "Acme (acme.invalid)" } });
        expect(providers[0].models).toEqual([{ id: "acme-live", label: "Acme Live", capabilities: { turnDetection: "client", sampleRates: [24000] } }]);
        const fields = providers[0].fields.map((field: any) => field.key);
        expect(fields).toEqual(["apiKey", "org", "baseUrl", "language", "beta"]);
        const secret = providers[0].fields.find((field: any) => field.key === "apiKey");
        expect(secret).toEqual({ key: "apiKey", label: "API key", type: "secret", required: true });
        noSecrets(providers);
    });
});
