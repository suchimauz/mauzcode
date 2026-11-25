import { expect, test } from "bun:test";
import provider from "./$voiceProvider_deepgram";
import load from "./$loader_voiceProvider";
import validateConfig from "./connections/validateConfig";

const KEY = "fake-deepgram-credential";
const ctx = {
    state: { procs: { boot: { entries: [] } } },
    fns: { procs: { modules: { list: () => [{ name: "core", dir: import.meta.dir }] }, log: { warn: () => {}, debug: () => {} } } },
} as unknown as Context;
const save = (config: Record<string, unknown>) => validateConfig(ctx, null, { provider: provider.id, config, secrets: { apiKey: KEY } });

/** Open the adapter against a socket stub that only records the URL and headers, then refuses the upgrade. */
async function upgradeOf(config: Record<string, types.voice.ConfigValue> = {}, options: types.voice.RecognitionOptions = {}) {
    let seen: { url: URL; headers: Record<string, string> } | undefined;
    let secretReads = 0;
    const conn: types.voice.ResolvedConnection = {
        id: "fixture", provider: provider.id, accountName: "unit", config, transport: { kind: "direct" },
        secret: async () => { secretReads++; return KEY; },
        fetch: async () => { throw new Error("no HTTP in this adapter"); },
        openWebSocket: (url, opts) => {
            seen = { url: new URL(url), headers: opts?.headers ?? {} };
            const socket = Object.assign(new EventTarget(), { readyState: 0, bufferedAmount: 0, send() {}, close() {}, terminate() {} });
            queueMicrotask(() => socket.dispatchEvent(Object.assign(new Event("error"), { message: "WebSocket upgrade failed: Expected 101 status code: 400" })));
            return socket as unknown as types.voice.BoundWebSocket;
        },
    };
    const error = await provider.open(ctx, conn, {
        sampleRate: 16_000, options, signal: new AbortController().signal, emit: () => {}, fail: () => {},
    }).catch((e: unknown) => e);
    return { seen, error, secretReads };
}

const params = (url: URL | undefined) => [...(url?.searchParams ?? [])];

test("built-in declaration registers with one nova-3 client-turn model at 16 kHz", async () => {
    const file = import.meta.path.replace("deepgram.unit.test.ts", "$voiceProvider_deepgram.ts");
    const registered = await load(ctx, null, { entries: [{
        name: provider.id, rel: `voice/$voiceProvider_${provider.id}.ts`, moduleDir: "voice",
        abs: file, root: "core", rootDir: import.meta.dir, mod: { default: provider },
    }] });
    expect(registered).toEqual({ registered: ["deepgram"], rejected: [] });
    expect(provider.models).toEqual([expect.objectContaining({
        id: "nova-3", capabilities: { turnDetection: "client", sampleRates: [16000], languages: true, keywords: true },
    })]);
    expect(provider.transports).toEqual(["direct", "socks", "ssh-tunnel"]);
    expect(provider.fields.map(field => field.key)).toEqual(["apiKey", "baseUrl", "languages", "keyterms", "smartFormat", "mipOptOut"]);
    expect(provider.destinationFor?.({ baseUrl: "https://api.deepgram.com" })).toEqual({ kind: "cloud", label: "Deepgram (api.deepgram.com)" });
    expect(provider.destinationFor?.({ baseUrl: "https://api.eu.deepgram.com", keyterms: "secret-term" })).toEqual({ kind: "cloud", label: "Configured endpoint (api.eu.deepgram.com)" });
});

test("saving applies defaults and rejects unsafe values with closed reasons, before any network call", async () => {
    expect((await save({})).config).toEqual({ baseUrl: "https://api.deepgram.com", smartFormat: true, mipOptOut: false });
    expect((await save({ languages: "ru, en, zh-Hans, nl-BE", keyterms: "MauzCode, OpenSpec" })).config).toMatchObject({ languages: "ru, en, zh-Hans, nl-BE" });
    const hundred = Array.from({ length: 100 }, (_, i) => `term${i}`).join(",");
    expect((await save({ keyterms: hundred })).config).toMatchObject({ keyterms: hundred });
    for (const [field, value, message] of [
        ["baseUrl", "http://api.deepgram.com", "Base URL must be"],
        ["baseUrl", "https://user:pw@api.deepgram.com", "Base URL must be"],
        ["baseUrl", "https://api.deepgram.com/?x=1", "Base URL must be"],
        ["languages", "Russian", "Languages must be"],
        ["languages", "ru;en", "Languages must be"],
        ["keyterms", "alpha\nbeta", "Keywords must be"],
        ["keyterms", `${hundred},term100`, "Keywords must be"],
        ["keyterms", "x".repeat(101), "Keywords must be"],
    ]) {
        await expect(save({ [field!]: value })).rejects.toMatchObject({ code: "VALIDATION", field, message: expect.stringContaining(message!) });
    }
    expect(provider.validateConfig?.({ baseUrl: "http://api.deepgram.com" })).toEqual({ field: "baseUrl", reason: "httpsEndpoint" });
    expect(provider.validateConfig?.({ languages: "English" })).toEqual({ field: "languages", reason: "languageList" });
    expect(provider.validateConfig?.({ keyterms: "a\nb" })).toEqual({ field: "keyterms", reason: "keywordList" });
    expect(provider.validateConfig?.({ baseUrl: "http://127.0.0.1:9" })).toBeUndefined();
});

test("Default connection: token header and the fixed query", async () => {
    const { seen, error } = await upgradeOf({});
    expect(seen?.url.origin + seen!.url.pathname).toBe("wss://api.deepgram.com/v1/listen");
    expect(seen?.url.search).toBe("?model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&endpointing=false&smart_format=true&no_delay=true&language=multi");
    expect(seen?.headers).toEqual({ Authorization: `Token ${KEY}` });
    expect(seen?.url.href).not.toContain(KEY);
    expect(error).toMatchObject({ code: "provider", diagnosticReason: "socketError", diagnosticDetail: "http_400" });
});

test("Smart formatting turned off drops smart_format and no_delay", async () => {
    const { seen } = await upgradeOf({ smartFormat: false });
    expect(seen?.url.searchParams.has("smart_format")).toBe(false);
    expect(seen?.url.searchParams.has("no_delay")).toBe(false);
});

test("Opt-out and keyterms add mip_opt_out and ordered keyterm parameters", async () => {
    const { seen } = await upgradeOf({ mipOptOut: true, keyterms: "MauzCode, OpenSpec" });
    expect(params(seen?.url).filter(([key]) => key === "mip_opt_out" || key === "keyterm")).toEqual([
        ["mip_opt_out", "true"], ["keyterm", "MauzCode"], ["keyterm", "OpenSpec"],
    ]);
    const { seen: spaced } = await upgradeOf({ keyterms: "Nova Three" });
    expect(spaced?.url.search).toContain("keyterm=Nova%20Three");
});

test("One language sends language=<tag> without hints", async () => {
    const { seen } = await upgradeOf({ languages: "ru" });
    expect(seen?.url.searchParams.getAll("language")).toEqual(["ru"]);
    expect(seen?.url.searchParams.has("language_hint")).toBe(false);
});

test("Several languages send multi with one hint each; chat languages replace connection languages", async () => {
    const { seen } = await upgradeOf({ languages: "ru, en" });
    expect(seen?.url.searchParams.getAll("language")).toEqual(["multi"]);
    expect(seen?.url.searchParams.getAll("language_hint")).toEqual(["ru", "en"]);
    const { seen: chat } = await upgradeOf({ languages: "ru, en" }, { languages: ["de"], keywords: ["Chat term"] });
    expect(chat?.url.searchParams.getAll("language")).toEqual(["de"]);
    expect(chat?.url.searchParams.getAll("keyterm")).toEqual(["Chat term"]);
});

test("invalid start options fail before reading the key or opening a socket", async () => {
    for (const options of [{ keywords: ["alpha\nbeta"] }, { keywords: Array.from({ length: 101 }, (_, i) => `t${i}`) }, { languages: ["English"] }]) {
        const { seen, error, secretReads } = await upgradeOf({}, options);
        expect(error).toMatchObject({ code: "protocol" });
        expect(seen).toBeUndefined();
        expect(secretReads).toBe(0);
    }
    const { seen, error } = await upgradeOf({ baseUrl: "http://api.deepgram.com" });
    expect(error).toMatchObject({ code: "routeUnavailable" });
    expect(seen).toBeUndefined();
});
