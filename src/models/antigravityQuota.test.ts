import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import quotasRoute from "../api/$route_v1_quotas_GET";
import { INVENTORY, RESET, STREAM, inventory, world } from "./fixtures/antigravityWorld.entry";

beforeAll(async () => { await mkTestCtx(); }, 60000);

const G = "MODEL_PROVIDER_GOOGLE", A = "MODEL_PROVIDER_ANTHROPIC";
const quotas = async (ctx: Context) => (await (await quotasRoute(ctx, null, { req: new Request("http://x/api/v1/quotas"), params: {} })).json() as any).accounts as any[];
const row = (w: any) => [w.model, w.family, w.usedPercent ?? null, w.resetAt ?? w.resetsAt ?? null];

describe("per-native-ID quota parsing (4.1)", () => {
    test("fraction and reset are read independently for every visible member before grouping", async () => {
        const ctx = await mkTestCtx();
        const windows = ctx.fns.models.provider.antigravity.mapUsage({ response: INVENTORY, observedAt: 1000 });
        expect(windows.map(row)).toEqual([
            ["gemini-4-neon-high", "gemini", 25, RESET], ["gemini-4-neon-xhigh", "gemini", 100, null], ["gemini-4-neon-medium", "gemini", 25, RESET], ["gemini-4-neon-low", "gemini", 25, RESET],
            // Out of range, non-numeric and absent values are unknown, never exhausted; a valid reset survives on its own.
            ["gemini-3.8-flash-high", "gemini", null, null], ["gemini-3.8-flash-medium", "gemini", null, null], ["gemini-3.8-flash-low", "gemini", null, RESET],
            ["gemini-3-flash", "gemini", null, null],
            ["claude-opus-5-5-low", "claude", 0, RESET], ["claude-opus-5-5-medium", "claude", 0, RESET], ["claude-opus-5-5-high", "claude", null, null],
            ["gemini-3-pro-high", "gemini", null, null], ["gemini-2.5-flash-lite", "gemini", null, null],
        ]);
        // 0.75 remaining is 25% used; the unitless remaining amount is never filled with a percentage.
        expect(windows[0]).toEqual({ label: "Gemini 4 Neon (High)", id: "antigravity:gemini-4-neon-high", scope: "model", model: "gemini-4-neon-high", family: "gemini", observedAt: 1000, usedPercent: 25, resetAt: RESET });
        expect(windows.every((w: any) => w.scope === "model" && w.period === undefined && w.remaining === undefined && w.durationSeconds === undefined)).toBe(true);
        // GPT-OSS, service-only and unattributed entries measure nothing here.
        expect(JSON.stringify(windows)).not.toMatch(/gpt-oss|tab_flash|unattributed|disabled/);
    });

    test("family comes from modelProvider, never from the name", async () => {
        const ctx = await mkTestCtx();
        const windows = ctx.fns.models.provider.antigravity.mapUsage({ observedAt: 1, response: {
            models: { "claude-looking": { modelProvider: G, quotaInfo: { remainingFraction: 1 } }, "gemini-looking": { modelProvider: A, quotaInfo: { remainingFraction: 0.5 } }, "claude-unknown": { modelProvider: "MODEL_PROVIDER_OTHER" } },
            agentModelSorts: [{ groups: [{ modelIds: ["claude-looking", "gemini-looking", "claude-unknown"] }] }] } });
        expect(windows.map(row)).toEqual([["claude-looking", "gemini", 0, null], ["gemini-looking", "claude", 50, null]]);
    });

    test("a locally hidden member is still measured, over the connection transport and without generating", async () => {
        const w = await world();
        const c = await w.connect("usage");
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-4-neon-high", enabled: false });
        const n = w.calls.length;
        const report = await w.ctx.fns.models.usage({ id: c.id });
        expect(report).toMatchObject({ status: "available", reason: "usage-ok" });
        expect(report.windows!.find((x: any) => x.model === "gemini-4-neon-high")).toMatchObject({ family: "gemini", usedPercent: 25, resetAt: RESET });
        expect(report.windows).toHaveLength(13);
        expect(w.calls.slice(n).map(x => x.url.split(":").pop())).toEqual(["fetchAvailableModels"]);
        expect(w.calls.some(x => x.url === STREAM)).toBe(false);
    });
});

describe("family data through normalization and the quota API (4.2)", () => {
    test("two families stay one account with typed measurements and no synthetic periods", async () => {
        const w = await world({ inventory: () => inventory(inv => {
            for (const id of Object.keys(inv.models)) if (inv.models[id].modelProvider === G || inv.models[id].modelProvider === A) inv.models[id].quotaInfo = { remainingFraction: 0.75, resetTime: "2031-01-02T03:04:05Z" };
            delete inv.models["claude-opus-5-5-low"].displayName;
        }) });
        const c = await w.connect("one");
        const accounts = (await quotas(w.ctx)).filter(a => a.provider === "antigravity");
        expect(accounts).toHaveLength(1);
        const [account] = accounts;
        expect(account).toMatchObject({ id: c.id, account: "one", label: "Antigravity · one", kind: "quota", windows: {}, families: [{ family: "gemini", partial: false }, { family: "claude", partial: false }] });
        const extra = account.additionalWindows as any[];
        expect(extra).toHaveLength(13);
        // Equal readings stay separate, attributable observations.
        expect(new Set(extra.map(x => x.id)).size).toBe(13);
        expect(extra.filter(x => x.family === "claude").map(x => x.model)).toEqual(["claude-opus-5-5-low", "claude-opus-5-5-medium", "claude-opus-5-5-high"]);
        expect(extra.every(x => x.scope === "model" && x.period === null && x.remaining === null && x.usedPercent === 25 && x.resetsAt === RESET && x.observedAt > 0 && (x.family === "gemini" || x.family === "claude"))).toBe(true);
        // The family is structural: an entry without a display name falls back to its id as label.
        expect(extra.find(x => x.model === "claude-opus-5-5-low")).toMatchObject({ label: "claude-opus-5-5-low", family: "claude", tone: "neutral" });
    });

    test("a truncated family is reported partial, never as a complete allowance", async () => {
        const w = await world({ inventory: () => {
            const ids = Array.from({ length: 45 }, (_, i) => `gemini-x-${i}`);
            return { models: { ...Object.fromEntries(ids.map(id => [id, { modelProvider: G, quotaInfo: { remainingFraction: 1 } }])), "claude-y": { modelProvider: A, quotaInfo: { remainingFraction: 0.5 } } },
                agentModelSorts: [{ groups: [{ modelIds: ["claude-y", ...ids] }] }] };
        } });
        const c = await w.connect("many");
        const report = await w.ctx.fns.models.usage({ id: c.id });
        expect(report.windows).toHaveLength(40);
        expect(report.partialFamilies).toEqual(["gemini"]);
        const [account] = (await quotas(w.ctx)).filter(a => a.id === c.id);
        expect(account.families).toEqual([{ family: "gemini", partial: true }, { family: "claude", partial: false }]);
        expect(account.additionalWindows.filter((x: any) => x.family === "claude")).toHaveLength(1);
    });

    test("only families with an enabled model are listed, and re-enabling restores them", async () => {
        const w = await world();
        const c = await w.connect("fam");
        const families = async () => (await quotas(w.ctx)).find(a => a.id === c.id).families?.map((f: any) => f.family);
        expect(await families()).toEqual(["gemini", "claude"]);
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "claude-opus-5-5", enabled: false });
        expect(await families()).toEqual(["gemini"]);
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "claude-opus-5-5", enabled: true });
        for (const s of ["low", "medium", "high"]) await w.ctx.fns.models.setModelEnabled({ id: c.id, model: `claude-opus-5-5-${s}`, enabled: false });
        expect(await families()).toEqual(["gemini"]);
        // The service still measured the disabled members.
        expect((await quotas(w.ctx)).find(a => a.id === c.id).additionalWindows.filter((x: any) => x.family === "claude")).toHaveLength(3);
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "claude-opus-5-5-low", enabled: true });
        expect(await families()).toEqual(["gemini", "claude"]);
        for (const m of (await w.ctx.fns.models.listModels({ id: c.id, cacheOnly: true })).models) await w.ctx.fns.models.setModelEnabled({ id: c.id, model: m.id, enabled: false });
        const none = (await quotas(w.ctx)).find(a => a.id === c.id);
        expect(none.families).toBeUndefined();
        // No shown family: the ordinary status card, without a count of hidden limits.
        expect(none).toMatchObject({ kind: "status", status: "available" });
        expect(none.additionalWindows).toBeUndefined();
    });
});

describe("one dated snapshot per connection (4.3)", () => {
    test("settings, the quota API and repeated reads reuse one observation", async () => {
        const w = await world();
        const c = await w.connect("snap");
        const n = w.lists().length;
        const first = await w.ctx.fns.models.usage({ id: c.id });
        const [again, api] = await Promise.all([w.ctx.fns.models.connections.usage({ id: c.id }), quotas(w.ctx)]);
        await quotas(w.ctx);
        expect(w.lists().length).toBe(n + 1);
        expect(again).toEqual(first);
        const account = api.find(a => a.id === c.id);
        expect(account.quotaUpdatedAt).toBe(first.checkedAt);
        expect(account.additionalWindows.map((x: any) => [x.model, x.usedPercent, x.resetsAt, x.observedAt])).toEqual(first.windows!.map((x: any) => [x.model, x.usedPercent ?? null, x.resetAt ?? null, x.observedAt]));
        // One observation instant for the whole snapshot, taken when the inventory was requested.
        expect(new Set(first.windows!.map((x: any) => x.observedAt)).size).toBe(1);
        expect(first.windows![0]!.observedAt).toBeLessThanOrEqual(first.checkedAt);
        await w.ctx.fns.models.usage({ id: c.id, refresh: true });
        expect(w.lists().length).toBe(n + 2);
    });

    test("sign-out and account replacement drop the old account's measurements", async () => {
        const w = await world({ inventory: call => call.headers.authorization!.endsWith("other") ? { models: { "gemini-b": { modelProvider: G, quotaInfo: { remainingFraction: 0.1 } } }, agentModelSorts: [{ groups: [{ modelIds: ["gemini-b"] }] }] } : INVENTORY });
        const c = await w.connect("swap");
        expect((await w.ctx.fns.models.usage({ id: c.id })).windows).toHaveLength(13);
        await w.ctx.fns.models.provider.antigravity.auth({ conn: c.conn, op: "store", tokens: { access_token: "ya29.SECRET-other", refresh_token: "r", expires_in: 3600 } });
        const replaced = await w.ctx.fns.models.usage({ id: c.id });
        expect(replaced.windows!.map(row)).toEqual([["gemini-b", "gemini", 90, null]]);
        await w.ctx.fns.models.action({ id: c.id, action: "logout" });
        const n = w.calls.length;
        const out = await w.ctx.fns.models.usage({ id: c.id });
        expect(out).toMatchObject({ status: "configured", reason: "login-required" });
        expect(out.windows).toBeUndefined();
        const account = (await quotas(w.ctx)).find(a => a.id === c.id);
        expect(account).toMatchObject({ kind: "status", status: "unknown" });
        expect(account.additionalWindows).toBeUndefined();
        expect(account.families).toBeUndefined();
        expect(w.calls.length).toBe(n);
    });

    test("a failed refresh is reported unavailable without secrets or invented numbers", async () => {
        let fail = false;
        const w = await world({ inventory: () => fail ? new Response(JSON.stringify({ error: { message: "ya29.SECRET-access leaked" } }), { status: 500 }) : INVENTORY });
        const c = await w.connect("fail");
        expect((await w.ctx.fns.models.usage({ id: c.id })).status).toBe("available");
        fail = true;
        const failed = await w.ctx.fns.models.usage({ id: c.id, refresh: true });
        expect(failed).toEqual({ status: "unavailable", reason: "usage-failed", checkedAt: expect.any(Number) });
        const account = (await quotas(w.ctx)).find(a => a.id === c.id);
        // The catalogue still names the families; with no measurement they read as unknown, not 0% or 100%.
        expect(account).toMatchObject({ kind: "status", status: "unavailable", quotaStatus: "unavailable", families: [{ family: "gemini", partial: false }, { family: "claude", partial: false }] });
        expect(JSON.stringify([failed, account])).not.toMatch(/SECRET|ya29/);
        // The catalogue itself is untouched by a failed usage read.
        expect((await w.ctx.fns.models.listModels({ id: c.id, cacheOnly: true })).models).toHaveLength(6);
    });

    test("a disabled connection or provider makes no remote call", async () => {
        const w = await world();
        const c = await w.connect("off");
        await w.ctx.fns.models.update({ id: c.id, enabled: false });
        const n = w.calls.length;
        expect(await w.ctx.fns.models.usage({ id: c.id, refresh: true })).toMatchObject({ status: "disabled" });
        expect((await quotas(w.ctx)).some(a => a.id === c.id)).toBe(false);
        await w.ctx.fns.models.update({ id: c.id, enabled: true });
        await w.ctx.fns.settings.set({ module: "models", scopeType: "global", key: "disabledProviders", value: ["antigravity"] });
        expect(await w.ctx.fns.models.usage({ id: c.id, refresh: true })).toMatchObject({ status: "disabled" });
        expect((await quotas(w.ctx)).some(a => a.id === c.id)).toBe(false);
        expect(w.calls.length).toBe(n);
    });
});
