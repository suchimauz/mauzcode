import { expect, test } from "bun:test";
import evidence from "../../fixtures/codex-controls/0.170.0.json";
import discover from "./codexListModels";
import reasoning from "./codexWireDiscoveredReasoning";
import level from "./codexWireLevel";
import profile from "./codexReasoningProfile";
import resolve from "../../inference/resolveReasoning";

function fixture(response: Response, accountId: string | null = "selected") {
    const auth = Object.freeze({ token: "fixture", accountId, generation: accountId && "G", credentialRevision: 7 });
    const ctx = { fns: { models: { provider: { codex: {
        codexVersion: () => "0.170.0", codexWireAuth: () => auth,
        codexWireChecked: (opts: { auth: unknown; res: Response }) => { expect(opts.auth).toBe(auth); return opts.res; },
        codexWireLevel: (opts: { v: unknown }) => level(ctx, null, opts),
        codexReasoningProfile: (opts: { model: string }) => profile(ctx, null, opts),
        codexWireDiscoveredReasoning: (opts: Parameters<typeof reasoning>[2]) => reasoning(ctx, null, opts),
    } } } } } as unknown as Context;
    const headers: Headers[] = [];
    const generations: (string | null)[] = [];
    const conn = { config: {}, fetch: async (_url: string, init: RequestInit) => { headers.push(new Headers(init.headers)); return response; } } as types.models.ResolvedConnection;
    return { catalogue: discover(ctx, null, { conn, onGeneration: g => generations.push(g) }), headers, generations };
}

test("catalogue projects only advertised controls on the issuing account", async () => {
    const bundled = evidence.bundledModelExcerpt;
    const { catalogue, headers, generations } = fixture(Response.json({ models: [
        bundled, { slug: "ultra-only", ...evidence.upstreamUltrafastTestModelOverride, support_verbosity: "true" },
        { slug: "both", additional_speed_tiers: ["unknown", "fast", "ultrafast"], service_tiers: [{ id: "priority" }], support_verbosity: true, default_verbosity: "invalid" },
        { slug: "gpt-6-ultrafast", service_tiers: [{ id: "future" }], default_verbosity: "low" },
    ] }));
    const models = await catalogue;
    expect(headers[0]!.get("chatgpt-account-id")).toBe("selected"); expect(generations).toEqual(["G"]);
    expect(models.map(m => m.responseControls)).toEqual([
        { speed: { supported: ["standard", "fast"] }, verbosity: { supported: ["low", "medium", "high"], default: "low" } },
        { speed: { supported: ["standard", "ultrafast"] } },
        { speed: { supported: ["standard", "fast", "ultrafast"] }, verbosity: { supported: ["low", "medium", "high"] } }, undefined,
    ]);
    const unknown = fixture(Response.json({ models: [] }), null);
    expect(await unknown.catalogue).toEqual([]); expect(unknown.headers[0]!.has("chatgpt-account-id")).toBe(false); expect(unknown.generations).toEqual([null]);
});

test("explicit unusable reasoning suppresses profiles; an invalid default does not erase usable levels", async () => {
    const { catalogue } = fixture(Response.json({ models: [
        { slug: "gpt-6-mixed", supported_reasoning_levels: ["none", { effort: "off" }, "xhigh", "max", "ultra"], default_reasoning_level: "ultra" },
        { slug: "gpt-6-invalid", supported_reasoning_levels: ["auto", "ultra"], support_verbosity: true },
        { slug: "gpt-6-null", supported_reasoning_levels: null }, { slug: "gpt-6-legacy" },
        { slug: "fresh", supported_reasoning_levels: ["xhigh", "max"], default_reasoning_level: "max" },
    ] }));
    const [mixed, invalid, nil, legacy, fresh] = await catalogue;
    expect(mixed!.reasoning).toEqual({ supported: ["off", "xhigh", "max"] });
    expect(invalid).toEqual({ id: "gpt-6-invalid", reasoningUnavailable: true, responseControls: { verbosity: { supported: ["low", "medium", "high"] } } });
    expect(nil).toEqual({ id: "gpt-6-null", reasoningUnavailable: true });
    expect(legacy!.reasoning?.supported).not.toContain("max"); expect(legacy!.reasoning?.default).toBe("medium");
    expect(fresh!.reasoning).toEqual({ supported: ["xhigh", "max"], default: "max" });
    const sdk = (preference: string, metadata: Parameters<typeof resolve>[2]["metadata"]) => resolve({} as Context, null, { model: "fixture", preference, metadata });
    for (const l of ["xhigh", "max"]) expect(sdk(l, mixed!.reasoning)).toMatchObject({ requested: l, applied: l, fallbackReason: null });
    expect(sdk("max", { supported: ["xhigh"], wire: { xhigh: "max" } })).toMatchObject({ requested: "max", applied: "xhigh", wire: "max" });
});

test("partial catalogues never reach the generation observer; a valid empty catalogue does", async () => {
    for (const response of [
        ...[{}, { models: null }, { models: [null] }, { models: [{ slug: " " }] }, { models: [{ slug: "a" }, { slug: "a" }] },
            { models: [], has_more: true }, { models: [], next_cursor: "more" }, { models: [], total: 1 },
            { models: Array.from({ length: 2001 }, (_, i) => ({ slug: `m${i}` })) }].map(x => Response.json(x)),
        new Response('{"models":['), Response.json({ models: [] }, { status: 206 }),
        Response.json({ models: [] }, { headers: { "Content-Length": "1000" } }), Response.json({ models: [] }, { headers: { "Content-Length": "20000000" } }),
    ]) {
        const { catalogue, generations } = fixture(response);
        await expect(catalogue).rejects.toThrow(/incomplete Codex model catalogue/); expect(generations).toEqual([]);
    }
});
