import { expect, test } from "bun:test";
import displayNames from "./displayNames";

const catalog = {
    anthropic: { models: { "claude-opus-4-5": { name: "Claude Opus 4.5 (latest)" } } },
    openai: { models: { "gpt-5": { name: "GPT-5" }, "shared-id": { name: "OpenAI Shared" } } },
    google: { models: { "gemma4-26b": { name: "Gemma 4 26B" }, "raw-id": { name: "raw-id" } } },
    other: { models: { "shared-id": { name: "Other Shared" } } },
};
type Conn = { id: string; provider: string; accountName: string };
function makeCtx(opts: { data?: object; connections?: Conn[]; cached?: Record<string, { id: string; label?: string }[]>; vendor?: Record<string, string> } = {}) {
    const calls = { list: 0, listModels: 0 };
    const providers = Object.fromEntries(Object.entries(opts.vendor ?? { claude: "anthropic", codex: "openai" }).map(([id, priceVendor]) => [id, { definition: { inference: { priceVendor } } }]));
    providers.custom = { definition: {} } as never;
    const ctx = {
        state: { models: { providers } },
        fns: { models: {
            connections: { list: async () => { calls.list++; return opts.connections ?? []; } },
            catalog: {
                priceCatalog: async () => opts.data ?? catalog,
                listModels: async ({ id }: { id: string }) => { calls.listModels++; return { models: opts.cached?.[id] ?? [] }; },
            },
        } },
    } as unknown as Context;
    return { ctx, calls };
}

test("prefers catalogue labels, then models.dev by provider vendor, then any vendor", async () => {
    const { ctx } = makeCtx({ connections: [{ id: "c1", provider: "codex", accountName: "me" }], cached: { c1: [{ id: "gpt-6-sol", label: "GPT-6-Sol" }] } });
    expect(await displayNames(ctx, null, { routes: ["codex/me:gpt-6-sol", "claude/a:claude-opus-4-5", "custom/Gate:gemma4-26b", "codex/me:shared-id"] })).toEqual({
        "codex/me:gpt-6-sol": "GPT-6-Sol",
        "claude/a:claude-opus-4-5": "Claude Opus 4.5",
        "custom/Gate:gemma4-26b": "Gemma 4 26B",
        "codex/me:shared-id": "OpenAI Shared",
    });
});

test("explicit labels skip the connection cache", async () => {
    const { ctx, calls } = makeCtx();
    expect(await displayNames(ctx, null, { routes: ["codex/me:x-model", "claude/a:claude-opus-4-5"], labels: { "codex/me:x-model": "X Model" } })).toEqual({
        "codex/me:x-model": "X Model", "claude/a:claude-opus-4-5": "Claude Opus 4.5",
    });
    expect(calls).toEqual({ list: 0, listModels: 0 });
});

test("a models.dev name equal to the id is ignored in favour of prettify", async () => {
    const { ctx } = makeCtx();
    expect(await displayNames(ctx, null, { routes: ["custom/Gate:raw-id"] })).toEqual({ "custom/Gate:raw-id": "Raw Id" });
});

test("empty or failing catalogue still yields readable prettified names", async () => {
    const { ctx } = makeCtx({ data: {} });
    expect(await displayNames(ctx, null, { routes: ["claude/a:claude-opus-5-5", "codex/me:gpt-5.1-codex-mini", "custom/z:glm-4.6", "custom/g:gemma4-26b", "bare-model"] })).toEqual({
        "claude/a:claude-opus-5-5": "Claude Opus 5.5",
        "codex/me:gpt-5.1-codex-mini": "GPT-5.1 Codex Mini",
        "custom/z:glm-4.6": "GLM-4.6",
        "custom/g:gemma4-26b": "Gemma4 26b",
        "bare-model": "Bare Model",
    });
    const failing = makeCtx();
    (failing.ctx.fns.models.catalog as unknown as { priceCatalog: () => Promise<never> }).priceCatalog = async () => { throw new Error("offline"); };
    expect(await displayNames(failing.ctx, null, { routes: ["claude/a:claude-haiku-4-5"] })).toEqual({ "claude/a:claude-haiku-4-5": "Claude Haiku 4.5" });
});

test("empty input returns an empty map without reading anything", async () => {
    const { ctx, calls } = makeCtx();
    expect(await displayNames(ctx, null, { routes: [] })).toEqual({});
    expect(calls.list).toBe(0);
});

test("ssh/<host>: prefixed routes get the same name as the plain route", async () => {
    const ctx: any = { state: {}, fns: { models: { connections: { list: async () => [] }, catalog: { priceCatalog: async () => ({}) } } } };
    const names = await displayNames(ctx, null, { routes: ["ssh/box:codex/acc:gpt-5.1-codex-mini", "ssh/box:claude-code/acc:claude-opus-4-5", "claude/a:claude-opus-4-5"], labels: { "claude/a:claude-opus-4-5": "Claude Opus 4.5 (label)" } });
    expect(names["ssh/box:codex/acc:gpt-5.1-codex-mini"]).toBe("GPT-5.1 Codex Mini");
    expect(names["ssh/box:claude-code/acc:claude-opus-4-5"]).toBe("Claude Opus 4.5");
});
