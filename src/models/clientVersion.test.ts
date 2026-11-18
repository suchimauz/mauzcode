import { describe, expect, test } from "bun:test";
import api from "./api";
import providers from "./providers";
import clientVersion from "./connections/clientVersion";
import resolve from "./connections/resolve";
import safeMessage from "./connections/safeMessage";
import claudeClientVersion from "./provider/claude/claudeClientVersion";
import claudeValidate from "./provider/claude/claudeValidate";
import claude from "./$modelProvider_claude";
import codex from "./$modelProvider_codex";
import custom from "./$modelProvider_custom";
import minimax from "./$modelProvider_minimax-coding";
import qwen from "./$modelProvider_qwen";
import zai from "./$modelProvider_zai-coding";

const owner = { user: { id: "owner", role: "owner" } } as unknown as Session;
const id = "cf664853-232b-48ce-bb44-ad837787990c";

// Exercise the real facade, resolver, provider hook and HTTP handler without a DB,
// credentials, CLI processes or external requests. Only storage/detection are stubbed.
function fixture(definition: types.models.ProviderDefinition = claude, config = {}) {
    const seen = { get: 0, secrets: 0, network: 0, refresh: [] as boolean[] };
    const ctx = { state: { models: { providers: Object.fromEntries([claude, codex, custom, minimax, qwen, zai].map(def => [def.id, { definition: def }])) } }, fns: {} } as unknown as Context;
    ctx.state.models!.providers![definition.id] = { definition, owner: "core", module: "models", rel: `models/$modelProvider_${definition.id}.ts` };
    const fns = {
        auth: { verifyCsrf: async ({ token }: { token: string }) => token === "good" },
        http: { publicOrigin: async () => "http://local" },
        secrets: { getLocal: async () => { seen.secrets++; throw new Error("credential access forbidden"); } },
        models: {
            transport: { fetch: async () => { seen.network++; throw new Error("network forbidden"); } },
            connections: {
                get: async (opts: { id: string }) => {
                    seen.get++;
                    if (opts.id !== id) throw Object.assign(new Error("Connection not found"), { status: 404, code: "NOT_FOUND" });
                    return { id, provider: definition.id, accountName: "test", config, secrets: { apiKey: true }, transport: { kind: "direct" } };
                },
                resolve: (opts: { id: string }) => resolve(ctx, null, opts),
                clientVersion: (opts: { id: string; refresh?: boolean }) => clientVersion(ctx, null, opts),
                safeMessage: (opts: { message: unknown; fallback: string }) => safeMessage(ctx, null, opts),
            },
            provider: { claude: {
                claudeValidate: (opts: { config: types.models.ResolvedConnection["config"] }) => claudeValidate(ctx, null, opts),
                claudeClientVersion: (opts: { conn: types.models.ResolvedConnection; refresh?: boolean }) => claudeClientVersion(ctx, null, opts),
                claudeCliVersionDetection: async (opts: { refresh?: boolean }) => {
                    seen.refresh.push(opts.refresh === true);
                    return { value: "2.1.300", detected: true };
                },
            } },
        },
    };
    Object.assign(ctx.fns, fns);
    return { ctx, seen };
}

function post(ctx: Context, body: unknown, session: Session | null = owner, token = "good", headers = {}) {
    return api(ctx, session, { req: new Request("http://local/models/api", {
        method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-csrf-token": token, ...headers },
    }) });
}

describe("connection client-version reporting", () => {
    test("only Claude and Codex advertise the optional hook", () => {
        const { ctx } = fixture();
        const views = providers(ctx, null, {});
        expect(views.filter(p => p.hasClientVersion).map(p => p.id)).toEqual(["claude", "codex"]);
        expect(views.filter(p => !p.hasClientVersion).map(p => p.id)).toEqual(["custom", "minimax-coding", "qwen", "zai-coding"]);
        expect(JSON.stringify(views)).not.toMatch(/secret:\/\/|"definition"|"clientVersion":/);
    });

    test("Claude connection reports detection and forwards explicit refresh", async () => {
        const { ctx, seen } = fixture();
        expect(await clientVersion(ctx, null, { id })).toEqual({ clientVersion: { version: "2.1.300", source: "detected" } });
        const response = await post(ctx, { action: "clientVersion", id, refresh: true });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({ clientVersion: { version: "2.1.300", source: "detected" } });
        expect(seen).toEqual({ get: 2, secrets: 0, network: 0, refresh: [false, true] });
    });

    test("Claude override skips detection and ignores non-boolean refresh", async () => {
        const { ctx, seen } = fixture(claude, { clientVersion: "2.1.299", detectCliVersion: false });
        expect(await (await post(ctx, { action: "clientVersion", id, refresh: "true" })).json()).toEqual({ clientVersion: { version: "2.1.299", source: "override" } });
        expect(seen.refresh).toEqual([]);
        const detection = fixture();
        await post(detection.ctx, { action: "clientVersion", id, refresh: "true" });
        expect(detection.seen.refresh).toEqual([false]);
    });

    test("unsupported provider returns null without invoking provider operations", async () => {
        const forbidden = async () => { throw new Error("provider operation must not run"); };
        const { ctx, seen } = fixture({ ...custom, test: forbidden, listModels: forbidden, usage: forbidden });
        expect(await clientVersion(ctx, null, { id })).toEqual({ clientVersion: null });
        expect(await (await post(ctx, { action: "clientVersion", id })).json()).toEqual({ clientVersion: null });
        expect(seen.secrets + seen.network).toBe(0);
    });

    test("unknown connection preserves NOT_FOUND through the API", async () => {
        const { ctx } = fixture();
        await expect(clientVersion(ctx, null, { id: "unknown" })).rejects.toThrow("Connection not found");
        const response = await post(ctx, { action: "clientVersion", id: "unknown" });
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "Connection not found", code: "NOT_FOUND" });
    });

    test("owner, CSRF and same-origin guards run before resolving the connection", async () => {
        const { ctx, seen } = fixture();
        const body = { action: "clientVersion", id };
        expect((await post(ctx, body, null)).status).toBe(401);
        expect((await post(ctx, body, { user: { id: "member", role: "member" } } as unknown as Session)).status).toBe(403);
        expect((await post(ctx, body, owner, "")).status).toBe(403);
        expect((await post(ctx, body, owner, "bad")).status).toBe(403);
        expect((await post(ctx, body, owner, "good", { origin: "https://other.example" })).status).toBe(403);
        expect((await post(ctx, body, owner, "good", { "sec-fetch-site": "cross-site" })).status).toBe(403);
        expect(seen.get).toBe(0);
    });

    test("projects only safe fields and removes secret/network capabilities from hook", async () => {
        const definition: types.models.ProviderDefinition = { ...claude, fields: [{ key: "apiKey", label: "Key", type: "secret" }],
            clientVersion: async (_ctx, conn) => {
                expect(await conn.secret("apiKey")).toBeNull();
                await expect(conn.fetch("https://invalid.example")).rejects.toThrow("cannot use the network");
                return { version: "2.1.300", source: "detected", detail: "Local CLI", secret: "secret://test/token", stdout: "raw command output", token: "fake-sensitive-value" };
            },
        };
        const { ctx, seen } = fixture(definition);
        const response = await post(ctx, { action: "clientVersion", id });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ clientVersion: { version: "2.1.300", source: "detected", detail: "Local CLI" } });
        expect(seen.secrets + seen.network).toBe(0);
    });

    test.each([
        null, {}, { version: 123, source: "detected" },
        { version: "2.1.300\nraw output", source: "detected" },
        { version: "x".repeat(41), source: "detected" },
        { version: "2.1.300", source: "unknown" },
        ...[123, "x".repeat(201), "raw\noutput", "secret://test/key", "op://vault/key", "env://TOKEN", "Bearer fake", "token=fake"].map(detail => ({ version: "2.1.300", source: "detected", detail })),
    ])("rejects malformed or unsafe reports without echoing their contents: %#", async report => {
        const { ctx } = fixture({ ...claude, clientVersion: async () => report as any });
        const response = await post(ctx, { action: "clientVersion", id });
        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ error: "Provider returned an invalid client version report" });
    });
});
