import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import quotasRoute from "../api/$route_v1_quotas_GET";
import { SUMMARY_BODY, STREAM, bucket, world } from "./fixtures/antigravityWorld.entry";

beforeAll(async () => { await mkTestCtx(); }, 60000);

const quotas = async (ctx: Context) => (await (await quotasRoute(ctx, null, { req: new Request("http://x/api/v1/quotas"), params: {} })).json() as any).accounts as any[];
const row = (w: any) => [w.bucket, w.scope, w.family ?? null, w.period ?? null, w.usedPercent ?? null, w.resetAt ?? w.resetsAt ?? null];
const T = (iso: string) => Date.parse(iso);
type W = NonNullable<types.models.UsageReport["windows"]>[number];
const map = async (response: Record<string, unknown>): Promise<W[]> => (await mkTestCtx()).fns.models.provider.antigravity.mapUsage({ response, observedAt: 1000 });

describe("summary buckets become group/period readings (1.2)", () => {
    test("four unequal readings keep their own family, period and reset", async () => {
        const windows = await map(SUMMARY_BODY);
        expect(windows.map(row)).toEqual([
            ["gemini-5h", "group", "gemini", "fiveHour", 20, T("2031-01-02T03:04:05Z")],
            ["gemini-weekly", "group", "gemini", "weekly", 60, T("2031-01-08T00:00:00Z")],
            ["3p-5h", "group", "claude", "fiveHour", 10, T("2031-01-02T05:00:00Z")],
            ["3p-weekly", "group", "claude", "weekly", 75, T("2031-01-09T00:00:00Z")],
        ]);
        expect(windows[0]).toEqual({ label: "Gemini 5h", id: "antigravity:gemini-5h", bucket: "gemini-5h", scope: "group", family: "gemini", period: "fiveHour", observedAt: 1000, usedPercent: 20, resetAt: T("2031-01-02T03:04:05Z") });
        expect(windows.every(w => w.model === undefined && w.remaining === undefined)).toBe(true);
    });

    test("0 and 1 fractions, missing or invalid fields stay distinct", async () => {
        const windows = await map({ groups: [
            { buckets: [bucket("gemini-5h", "5h", 0, "2031-01-02T03:04:05Z"), bucket("gemini-weekly", "weekly", 1)] },
            { buckets: [bucket("3p-5h", "5h", undefined, "2031-01-02T05:00:00Z"), { ...bucket("3p-weekly", "weekly", 0.5), resetTime: "soon" }] },
        ] });
        expect(windows.map(row)).toEqual([
            ["gemini-5h", "group", "gemini", "fiveHour", 100, T("2031-01-02T03:04:05Z")],
            ["gemini-weekly", "group", "gemini", "weekly", 0, null],
            ["3p-5h", "group", "claude", "fiveHour", null, T("2031-01-02T05:00:00Z")],
            ["3p-weekly", "group", "claude", "weekly", 50, null],
        ]);
        for (const bad of [-0.1, 1.5, "0.5", NaN, null]) {
            const [w] = await map({ groups: [{ buckets: [{ bucketId: "gemini-5h", window: "5h", remainingFraction: bad }] }] });
            expect(row(w)).toEqual(["gemini-5h", "group", "gemini", "fiveHour", null, null]);
        }
    });

    test("a missing family, conflicting buckets and mismatching windows fill nothing", async () => {
        // Only Gemini reported: no Claude reading is invented.
        expect((await map({ groups: [{ buckets: [bucket("gemini-5h", "5h", 0.5)] }] })).map(w => w.bucket)).toEqual(["gemini-5h"]);
        // A repeated ID cannot win by array order; the other period survives.
        const dup = await map({ groups: [{ buckets: [bucket("gemini-5h", "5h", 0.1), bucket("gemini-5h", "5h", 0.9), bucket("gemini-weekly", "weekly", 0.5)] }] });
        expect(dup.map(w => w.bucket)).toEqual(["gemini-weekly"]);
        // The structured window must agree with the ID; a general bucket in another family's group is conflicting.
        expect(await map({ groups: [{ buckets: [bucket("gemini-5h", "weekly", 0.5)] }] })).toEqual([]);
        expect((await map({ groups: [{ buckets: [bucket("gemini-5h", "5h", 0.5), bucket("3p-5h", "5h", 0.5)] }] })).map(w => w.bucket)).toEqual([]);
        // Display names never classify.
        expect(await map({ groups: [{ displayName: "Gemini", buckets: [{ displayName: "Gemini 5h", window: "5h", remainingFraction: 0.5 }] }] })).toEqual([]);
    });

    test("a model-specific weekly bucket stays a separate extra of its group; an unattributed one has no family", async () => {
        const windows = await map({ groups: [
            { buckets: [bucket("gemini-weekly", "weekly", 0.4), bucket("gemini-pro-weekly", "weekly", 0.1, "2031-02-01T00:00:00Z", "Gemini Pro weekly")] },
            { buckets: [bucket("other-daily", "daily", 0.5, undefined, "Gemini something")] },
        ] });
        expect(windows.map(row)).toEqual([
            ["gemini-weekly", "group", "gemini", "weekly", 60, null],
            ["gemini-pro-weekly", "unknown", "gemini", "weekly", 90, T("2031-02-01T00:00:00Z")],
            ["other-daily", "unknown", null, null, 50, null],
        ]);
    });

    test("a malformed envelope is a failed read, not an empty observation", async () => {
        const ctx = await mkTestCtx();
        for (const bad of [{}, { groups: {} }, { groups: "x" }]) expect(() => ctx.fns.models.provider.antigravity.mapUsage({ response: bad, observedAt: 1 })).toThrow(/invalid/);
        expect(ctx.fns.models.provider.antigravity.mapUsage({ response: { groups: [] }, observedAt: 1 })).toEqual([]);
    });
});

describe("the usage path reads the summary (1.1)", () => {
    test("one summary read with the connection's project, Hub identity and transport; no inventory, no generation", async () => {
        const w = await world();
        const c = await w.connect("usage");
        const n = w.calls.length;
        const report = await w.ctx.fns.models.usage({ id: c.id });
        expect(report).toMatchObject({ status: "available", reason: "usage-ok" });
        expect(report.windows!.map(row)).toEqual((await map(SUMMARY_BODY)).map(row));
        const sent = w.calls.slice(n);
        expect(sent.map(x => [x.url.split(":").pop(), x.method, x.body])).toEqual([["retrieveUserQuotaSummary", "POST", { project: "proj-cess" }]]);
        expect(sent[0]!.headers["user-agent"]).toBe(w.ctx.fns.models.provider.antigravity.constants({}).userAgent);
        expect(w.calls.some(x => x.url === STREAM)).toBe(false);
        // A locally disabled model does not remove the account's measurement.
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-3-flash", enabled: false });
        expect((await w.ctx.fns.models.usage({ id: c.id, refresh: true })).windows).toHaveLength(4);
    });

    test("a malformed summary or HTTP failure is a failed read without secrets", async () => {
        let mode: "bad" | "http" = "bad";
        const w = await world({ summary: () => mode === "bad" ? { nothing: true } : new Response(JSON.stringify({ error: { message: "ya29.SECRET-access leaked" } }), { status: 500 }) });
        const c = await w.connect("bad");
        expect(await w.ctx.fns.models.usage({ id: c.id })).toEqual({ status: "unavailable", reason: "usage-failed", checkedAt: expect.any(Number) });
        mode = "http";
        const failed = await w.ctx.fns.models.usage({ id: c.id, refresh: true });
        expect(failed).toEqual({ status: "unavailable", reason: "usage-failed", checkedAt: expect.any(Number) });
        expect(JSON.stringify(failed)).not.toMatch(/SECRET|ya29|proj-/);
    });
});

describe("grouped readings through normalization and the quota API (1.3)", () => {
    test("one connection, two families, four periods, one extra and no invented account windows", async () => {
        const body = structuredClone(SUMMARY_BODY) as any;
        body.groups[0].buckets.push(bucket("gemini-pro-weekly", "weekly", 0.3, "2031-02-01T00:00:00Z", "Gemini Pro weekly"));
        const w = await world({ summary: () => body });
        const c = await w.connect("one");
        const report = await w.ctx.fns.models.usage({ id: c.id });
        expect(report.windows!.map((x: W) => x.bucket)).toEqual(["gemini-5h", "gemini-weekly", "gemini-pro-weekly", "3p-5h", "3p-weekly"]);
        const accounts = (await quotas(w.ctx)).filter(a => a.provider === "antigravity");
        expect(accounts).toHaveLength(1);
        const [account] = accounts;
        expect(account).toMatchObject({ id: c.id, account: "one", kind: "quota", windows: {}, quotaStatus: "fresh", families: [{ family: "gemini", partial: false }, { family: "claude", partial: false }] });
        expect(account.additionalWindows.map((x: any) => [x.bucket, x.scope, x.family, x.period, x.usedPercent, x.resetsAt])).toEqual([
            ["gemini-5h", "group", "gemini", "fiveHour", 20, T("2031-01-02T03:04:05Z")],
            ["gemini-weekly", "group", "gemini", "weekly", 60, T("2031-01-08T00:00:00Z")],
            ["gemini-pro-weekly", "unknown", "gemini", "weekly", 70, T("2031-02-01T00:00:00Z")],
            ["3p-5h", "group", "claude", "fiveHour", 10, T("2031-01-02T05:00:00Z")],
            ["3p-weekly", "group", "claude", "weekly", 75, T("2031-01-09T00:00:00Z")],
        ]);
        expect(account.additionalWindows.every((x: any) => x.model === null && x.remaining === null && x.observedAt === report.windows![0]!.observedAt && x.observedAt <= report.checkedAt)).toBe(true);
    });

    test("identical family readings are two distinguishable readings, not two accounts or an account limit", async () => {
        const same = { groups: [{ displayName: "Близнецы", buckets: [bucket("gemini-5h", "5h", 0.5, "2031-01-02T03:04:05Z", "Пять часов")] }, { buckets: [bucket("3p-5h", "5h", 0.5, "2031-01-02T03:04:05Z", "Пять часов")] }] };
        const w = await world({ summary: () => same });
        const c = await w.connect("twin");
        const [account] = (await quotas(w.ctx)).filter(a => a.id === c.id);
        expect(account.windows).toEqual({});
        expect(account.additionalWindows.map((x: any) => [x.id, x.family, x.period])).toEqual([["antigravity:gemini-5h", "gemini", "fiveHour"], ["antigravity:3p-5h", "claude", "fiveHour"]]);
    });

    test("a family reading above the alert threshold raises the account's severity without filling an account cell", async () => {
        const w = await world({ summary: () => ({ groups: [{ buckets: [bucket("gemini-5h", "5h", 0.9)] }, { buckets: [bucket("3p-5h", "5h", 0.1)] }] }) });
        const c = await w.connect("hot");
        const view = await w.ctx.fns.frontendBridge.modelUsage({});
        const conn = view.connections.find((x: types.frontendBridge.ModelUsageView["connections"][number]) => x.id === c.id)!;
        expect(conn.level).toBe("alert");
        expect(conn.windows.find((x: W) => x.bucket === "3p-5h")!.level).toBe("alert");
        const [account] = (await quotas(w.ctx)).filter(a => a.id === c.id);
        expect(account.tone).toBe("error");
        expect(account.windows).toEqual({});
        expect(account.additionalWindows.find((x: any) => x.bucket === "3p-5h")).toMatchObject({ tone: "error", usedPercent: 90 });
    });

    test("other providers' main columns are unchanged by the group scope", async () => {
        const ctx = await mkTestCtx();
        const def = { id: "acct", label: "Acct", fields: [], transports: ["direct"], test: async () => ({ status: "available", reason: "ok", checkedAt: Date.now() }),
            usage: async () => ({ status: "available", checkedAt: Date.now(), windows: [{ label: "5h", scope: "account", period: "fiveHour", usedPercent: 40 }, { label: "Opus", scope: "model", model: "opus", usedPercent: 10 }] }) };
        ctx.state.models ??= {};
        ctx.state.models.providers = { ...(ctx.state.models.providers ?? {}), acct: { owner: "core", module: "models", rel: "models/$modelProvider_acct.ts", definition: def as any } };
        const view = await ctx.fns.models.create({ provider: "acct", accountName: "a-" + crypto.randomUUID().slice(0, 6), config: {}, secrets: {}, transport: { kind: "direct" } });
        const [account] = (await quotas(ctx)).filter(a => a.id === view.id);
        expect(account.windows).toEqual({ fiveHour: { usedPercent: 40, resetsAt: null, tone: "warning" } });
        expect(account.additionalWindows.map((x: any) => [x.label, x.scope, x.bucket])).toEqual([["Opus", "model", null]]);
    });

    test("pre-summary (inventory) snapshots cached before the upgrade are discarded, never shown", async () => {
        const w = await world();
        const c = await w.connect("upgrade");
        const view = await w.ctx.fns.models.connections.get({ id: c.id });
        const revision = `${c.id}:${Bun.hash(`${c.id}:${view.updatedAt}`).toString(36)}`;
        const old: types.models.UsageReport = { status: "available", reason: "usage-ok", checkedAt: 5, windows: [{ label: "Gemini 4 Neon (High)", id: "antigravity:gemini-4-neon-high", scope: "model", model: "gemini-4-neon-high", family: "gemini", observedAt: 5, usedPercent: 99 }] };
        w.ctx.state.models!.health![`${revision}:usage`] = { expiresAt: Date.now() + 600_000, result: old };
        const report = await w.ctx.fns.models.usage({ id: c.id });
        expect(report.windows!.map((x: W) => x.bucket)).toEqual(["gemini-5h", "gemini-weekly", "3p-5h", "3p-weekly"]);
        expect(Object.keys(w.ctx.state.models!.health!).filter(k => k.startsWith(revision + ":usage"))).toEqual([`${revision}:usage@quota-summary-1`]);
        // A failing first read after the upgrade has no earlier success: the old snapshot is neither a reading nor stale data.
        let fail = true;
        const w2 = await world({ summary: () => fail ? new Response("", { status: 500 }) : SUMMARY_BODY });
        const c2 = await w2.connect("upgrade2");
        const v2 = await w2.ctx.fns.models.connections.get({ id: c2.id });
        const rev2 = `${c2.id}:${Bun.hash(`${c2.id}:${v2.updatedAt}`).toString(36)}`;
        w2.ctx.state.models!.health![`${rev2}:usage`] = { expiresAt: 0, result: old };
        expect(await w2.ctx.fns.models.usage({ id: c2.id })).toEqual({ status: "unavailable", reason: "usage-failed", checkedAt: expect.any(Number) });
        const [account] = (await quotas(w2.ctx)).filter(a => a.id === c2.id);
        expect(account).toMatchObject({ kind: "status", quotaStatus: "unavailable" });
        expect(JSON.stringify(account)).not.toContain("gemini-4-neon-high");
        fail = false;
        expect((await w2.ctx.fns.models.usage({ id: c2.id, refresh: true })).windows).toHaveLength(4);
    });
});

describe("one snapshot per connection, stale on failure (1.3, 2.1)", () => {
    test("settings, the quota API and repeated reads reuse one observation", async () => {
        const w = await world();
        const c = await w.connect("snap");
        const first = await w.ctx.fns.models.usage({ id: c.id });
        const [again, api] = await Promise.all([w.ctx.fns.models.connections.usage({ id: c.id }), quotas(w.ctx)]);
        expect(w.summaries()).toHaveLength(1);
        expect(again).toEqual(first);
        const account = api.find(a => a.id === c.id);
        expect(account.quotaUpdatedAt).toBe(first.checkedAt);
        expect(new Set(first.windows!.map((x: W) => x.observedAt)).size).toBe(1);
        await w.ctx.fns.models.usage({ id: c.id, refresh: true });
        expect(w.summaries()).toHaveLength(2);
    });

    test("a failure after a success keeps it stale with its original time; recovery replaces it, clearing a missing bucket", async () => {
        let mode: "ok" | "fail" | "partial" = "ok";
        const w = await world({ summary: () => mode === "fail" ? new Response(JSON.stringify({ error: { message: "ya29.SECRET-access" } }), { status: 503 })
            : mode === "partial" ? { groups: [{ buckets: [bucket("gemini-5h", "5h", 0.5)] }] } : SUMMARY_BODY });
        const c = await w.connect("stale");
        const ok = await w.ctx.fns.models.usage({ id: c.id });
        mode = "fail";
        const stale = await w.ctx.fns.models.usage({ id: c.id, refresh: true });
        expect(stale).toEqual({ ...ok, stale: true, reason: "usage-stale" });
        const [account] = (await quotas(w.ctx)).filter(a => a.id === c.id);
        expect(account).toMatchObject({ quotaStatus: "stale", quotaUpdatedAt: ok.checkedAt, kind: "quota" });
        expect(account.additionalWindows).toHaveLength(4);
        expect(JSON.stringify(account)).not.toMatch(/SECRET|ya29/);
        await Bun.sleep(2);
        mode = "partial";
        const recovered = await w.ctx.fns.models.usage({ id: c.id, refresh: true });
        expect(recovered.stale).toBeUndefined();
        expect(recovered.checkedAt).toBeGreaterThan(ok.checkedAt);
        expect(recovered.windows!.map((x: W) => x.bucket)).toEqual(["gemini-5h"]);
        const [after] = (await quotas(w.ctx)).filter(a => a.id === c.id);
        expect(after).toMatchObject({ quotaStatus: "fresh", quotaUpdatedAt: recovered.checkedAt });
        expect(after.additionalWindows.map((x: any) => x.bucket)).toEqual(["gemini-5h"]);
    });

    test("a first failure without a success shows no data", async () => {
        const w = await world({ summary: () => new Response("", { status: 500 }) });
        const c = await w.connect("cold");
        expect(await w.ctx.fns.models.usage({ id: c.id })).toEqual({ status: "unavailable", reason: "usage-failed", checkedAt: expect.any(Number) });
        const [account] = (await quotas(w.ctx)).filter(a => a.id === c.id);
        expect(account).toMatchObject({ kind: "status", status: "unavailable", quotaStatus: "unavailable", families: [{ family: "gemini", partial: false }, { family: "claude", partial: false }] });
        expect((await w.ctx.fns.models.listModels({ id: c.id, cacheOnly: true })).models).toHaveLength(6);
    });

    test("sign-out and account replacement never reuse the old account's snapshot, even as stale", async () => {
        const w = await world({ summary: call => call.headers.authorization!.endsWith("other") ? new Response("", { status: 500 }) : SUMMARY_BODY });
        const c = await w.connect("swap");
        expect((await w.ctx.fns.models.usage({ id: c.id })).windows).toHaveLength(4);
        await w.ctx.fns.models.provider.antigravity.auth({ conn: c.conn, op: "store", tokens: { access_token: "ya29.SECRET-other", refresh_token: "r", expires_in: 3600 } });
        expect(await w.ctx.fns.models.usage({ id: c.id })).toEqual({ status: "unavailable", reason: "usage-failed", checkedAt: expect.any(Number) });
        await w.ctx.fns.models.action({ id: c.id, action: "logout" });
        const n = w.calls.length;
        const out = await w.ctx.fns.models.usage({ id: c.id });
        expect(out).toMatchObject({ status: "configured", reason: "login-required" });
        expect(out.windows).toBeUndefined();
        const account = (await quotas(w.ctx)).find(a => a.id === c.id);
        expect(account).toMatchObject({ kind: "status", status: "unknown" });
        expect(account.additionalWindows).toBeUndefined();
        expect(w.calls.length).toBe(n);
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

describe("one-minute freshness (2.1)", () => {
    test("the provider TTL is below the 60 s poll and other providers keep their cadence", async () => {
        const ag = (await import("./$modelProvider_antigravity")).default;
        expect(ag.usageRefreshMs).toBeLessThan(60000);
        expect(ag.usageRefreshMs).toBeGreaterThanOrEqual(50000);
        expect((await import("./$modelProvider_claude")).default.usageRefreshMs).toBe(180000);
        expect((await import("./$modelProvider_qwen")).default.usageRefreshMs).toBe(10000);
    });

    test("with a fake clock a change just after an observation is shown by the next poll, overlapping readers share one probe", async () => {
        let value = 0.8;
        let release: (() => void) | undefined;
        // Resolve the pending summary only once the provider has actually asked for it.
        const answer = async () => { while (!release) await Bun.sleep(1); const r = release; release = undefined; r(); };
        const w = await world({ summary: async () => { await new Promise<void>(r => { release = r; }); return { groups: [{ buckets: [bucket("gemini-5h", "5h", value)] }] }; } });
        const c = await w.connect("clock");
        const realNow = Date.now;
        let now = realNow();
        Date.now = () => now;
        try {
            const read = () => w.ctx.fns.models.usage({ id: c.id });
            const a = read(), b = read();
            await answer();
            const [ra, rb] = await Promise.all([a, b]);
            expect(ra).toEqual(rb);
            expect(w.summaries()).toHaveLength(1);
            expect(ra.windows![0]!.usedPercent).toBeCloseTo(20);
            // The reported summary changes right after this observation; the next poll, 60 s later, must see it.
            value = 0.3;
            now += 60_000;
            const next = read();
            await answer();
            expect((await next).windows![0]!.usedPercent).toBeCloseTo(70);
            expect(w.summaries()).toHaveLength(2);
        } finally { Date.now = realNow; }
    });
});
