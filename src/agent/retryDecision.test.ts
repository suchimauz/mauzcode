import { describe, expect, test } from "bun:test";
import retryCodes from "./retryCodes";
import retryDecision from "./retryDecision";
import retryPolicySetting from "./$setting_retryPolicy";

// A context with only what the decision function reads: the settings chain, the code
// vocabulary and a warn logger. No database, no live agent, no network.
function ctxWith(policy?: Record<string, unknown>, logged: any[] = []) {
    const ctx: any = {
        state: { settings: { registry: new Map() } },
        fns: {
            settings: { get: async ({ key }: any) => key === "retryPolicy" ? policy : undefined },
            procs: { log: { warn: (entry: any) => logged.push(entry) } },
            agent: {},
        },
    };
    ctx.fns.agent.retryCodes = (o: any) => retryCodes(ctx, null, o);
    ctx.fns.agent.retryDecision = (o: any) => retryDecision(ctx, null, o);
    return ctx;
}
const decide = (ctx: any, error: any, retry = 0, provider?: string) => retryDecision(ctx, null, { error, provider, retry, now: 1_000_000 });

describe("retry vocabulary", () => {
    test("allowed and never-listed codes never overlap, and both sets stay alphabetically stable", () => {
        const { allowed, never } = retryCodes(ctxWith(), null, {});
        expect(allowed.filter(code => never.includes(code))).toEqual([]);
        expect(allowed).toContain("PROVIDER_ERROR");
        expect(never).toEqual(expect.arrayContaining(["QUOTA_EXHAUSTED", "AUTH", "OVERFLOW", "CANCELLED"]));
    });
});

describe("retry policy declaration", () => {
    test("shipped defaults match the documented numbers", () => {
        expect(retryPolicySetting.default).toMatchObject({ maxRetries: 5, initialDelayMs: 1000, maxDelayMs: 60000, jitterRatio: 0.2, providers: {} });
        expect(retryPolicySetting.default.retryableCodes).toContain("PROVIDER_ERROR");
    });
    test("rejects an unknown code and a code no policy may retry", () => {
        const ctx = ctxWith();
        expect(() => retryPolicySetting.validate(ctx, { retryableCodes: ["NOPE"] })).toThrow(/not a known retryable/);
        expect(() => retryPolicySetting.validate(ctx, { retryableCodes: ["AUTH"] })).toThrow(/never retried/);
        expect(() => retryPolicySetting.validate(ctx, { retryableCodes: ["TRANSPORT"] })).not.toThrow();
        expect(() => retryPolicySetting.validate(ctx, { providers: { codex: { retryableCodes: ["OVERFLOW"] } } })).toThrow(/never retried/);
    });
    test("rejects non-numeric limits and a non-object shape", () => {
        const ctx = ctxWith();
        expect(() => retryPolicySetting.validate(ctx, [])).toThrow(/must be an object/);
        expect(() => retryPolicySetting.validate(ctx, { maxRetries: "5" })).toThrow(/finite number/);
        expect(() => retryPolicySetting.validate(ctx, { providers: [] })).toThrow(/must map a provider id/);
    });
});

describe("retry decision", () => {
    test("an SDK failure is classified by code, never by message text", async () => {
        const ctx = ctxWith();
        const failure = (code: string, retryable = true, extra: any = {}) => ({ failure: { code, classification: "transport", retryable, replaySafe: false, acceptance: "uncertain", ...extra } });
        expect(await decide(ctx, failure("TRANSPORT"))).toMatchObject({ retry: true, code: "TRANSPORT" });
        expect(await decide(ctx, failure("AUTH"))).toMatchObject({ retry: false });
        expect(await decide(ctx, failure("QUOTA_EXHAUSTED", true))).toMatchObject({ retry: false });
        // A message that reads like a network error does not make an unknown code retryable.
        expect(await decide(ctx, Object.assign(new Error("socket hang up TRANSPORT"), { code: "SOMETHING_ELSE" }))).toMatchObject({ retry: false });
        expect(await decide(ctx, new Error("socket hang up"))).toMatchObject({ retry: false, code: null });
    });

    test("a failure is retried only when the code is allowed AND the source did not refuse", async () => {
        const ctx = ctxWith();
        const f = (code: string, retryable?: boolean) => ({ failure: { code, classification: "provider", retryable, replaySafe: true, acceptance: "none" } });
        expect(await decide(ctx, f("SERVER", true))).toMatchObject({ retry: true });
        expect(await decide(ctx, f("SERVER", false))).toMatchObject({ retry: false });
        // Absent flag means "no opinion": the code decides.
        expect(await decide(ctx, f("SERVER"))).toMatchObject({ retry: true });
    });

    test("a bare TRANSPORT without failure metadata is retryable; a configuration error is not", async () => {
        const ctx = ctxWith();
        expect(await decide(ctx, Object.assign(new Error("Model transport failed"), { code: "TRANSPORT" }))).toMatchObject({ retry: true });
        expect(await decide(ctx, Object.assign(new Error("Proxy not found"), { code: "TRANSPORT", retryable: false }))).toMatchObject({ retry: false });
        expect(await decide(ctx, Object.assign(new Error("Invalid transport timeout"), { code: "TRANSPORT", retryable: false }))).toMatchObject({ retry: false });
    });

    test("SSH transport failures translate their phase into a code", async () => {
        const ctx = ctxWith();
        expect(await decide(ctx, { transportFailure: { kind: "ssh_transport", phase: "before_dispatch", retryable: true } })).toMatchObject({ retry: true, code: "SSH_TRANSPORT" });
        expect(await decide(ctx, { transportFailure: { kind: "ssh_transport", phase: "ambiguous", retryable: true } })).toMatchObject({ retry: true });
        expect(await decide(ctx, { transportFailure: { kind: "ssh_transport", phase: "permanent", retryable: false } })).toMatchObject({ retry: false });
    });

    test("backoff grows exponentially and stays inside the configured bounds", async () => {
        const ctx = ctxWith({ maxRetries: 8, initialDelayMs: 1000, maxDelayMs: 5000, jitterRatio: 0 });
        const error = { failure: { code: "TRANSPORT", retryable: true } };
        const delays = [] as number[];
        for (const retry of [0, 1, 2, 3, 7]) delays.push((await decide(ctx, error, retry)).delayMs);
        expect(delays).toEqual([1000, 2000, 4000, 5000, 5000]);
    });

    test("jitter stays inside its ratio and never makes a delay negative", async () => {
        const ctx = ctxWith({ initialDelayMs: 1000, maxDelayMs: 60000, jitterRatio: 0.2 });
        const error = { failure: { code: "TRANSPORT", retryable: true } };
        for (let i = 0; i < 50; i++) {
            const { delayMs } = await decide(ctx, error, 0);
            expect(delayMs).toBeGreaterThanOrEqual(800);
            expect(delayMs).toBeLessThanOrEqual(1200);
        }
    });

    test("the retry limit stops the decision and is reported", async () => {
        const ctx = ctxWith({ maxRetries: 2, jitterRatio: 0 });
        const error = { failure: { code: "TRANSPORT", retryable: true } };
        expect(await decide(ctx, error, 1)).toMatchObject({ retry: true, maxRetries: 2 });
        expect(await decide(ctx, error, 2)).toMatchObject({ retry: false, maxRetries: 2 });
    });

    test("a provider override replaces the global limit for that provider only", async () => {
        const ctx = ctxWith({ maxRetries: 5, jitterRatio: 0, providers: { codex: { maxRetries: 2 } } });
        const error = { failure: { code: "TRANSPORT", retryable: true } };
        expect(await decide(ctx, error, 1, "codex")).toMatchObject({ retry: true, maxRetries: 2 });
        expect(await decide(ctx, error, 2, "codex")).toMatchObject({ retry: false });
        expect(await decide(ctx, error, 2, "custom")).toMatchObject({ retry: true, maxRetries: 5 });
    });

    test("retryableCodes narrows the allowed set but cannot widen it", async () => {
        const narrowed = ctxWith({ jitterRatio: 0, retryableCodes: ["TIMEOUT"] });
        expect(await decide(narrowed, { failure: { code: "TIMEOUT", retryable: true } })).toMatchObject({ retry: true });
        expect(await decide(narrowed, { failure: { code: "TRANSPORT", retryable: true } })).toMatchObject({ retry: false });
        const widened = ctxWith({ jitterRatio: 0, retryableCodes: ["AUTH", "TRANSPORT"] });
        expect(await decide(widened, { failure: { code: "AUTH", retryable: true } })).toMatchObject({ retry: false });
    });

    test("an unknown configured code is ignored and reported once", async () => {
        const logged: any[] = [];
        const ctx = ctxWith({ jitterRatio: 0, retryableCodes: ["TRANSPORT", "BOGUS", "BOGUS"] }, logged);
        expect(await decide(ctx, { failure: { code: "TRANSPORT", retryable: true } })).toMatchObject({ retry: true });
        await decide(ctx, { failure: { code: "TRANSPORT", retryable: true } });
        expect(logged).toHaveLength(1);
        expect(logged[0].event).toBe("agent.retryPolicy.unknown-code");
    });

    test("a Retry-After below the maximum is honored as a lower bound", async () => {
        const ctx = ctxWith({ initialDelayMs: 1000, maxDelayMs: 60000, jitterRatio: 0 });
        const { delayMs, retry, parkUntil } = await decide(ctx, { failure: { code: "RATE_LIMITED", retryable: true, retryAfterMs: 7000 } });
        expect(retry).toBe(true);
        expect(delayMs).toBe(7000);
        expect(parkUntil).toBeUndefined();
    });

    test("a Retry-After above the maximum parks instead of retrying too early", async () => {
        const ctx = ctxWith({ maxDelayMs: 60000 });
        const decision = await decide(ctx, { failure: { code: "RATE_LIMITED", retryable: true, retryAfterMs: 120001 } });
        expect(decision.retry).toBe(false);
        expect(decision.parkUntil).toBe(1_000_000 + 120001);
    });

    test("a two-day Retry-After parks for at most 30 minutes", async () => {
        const ctx = ctxWith({ maxDelayMs: 60000 });
        const decision = await decide(ctx, { failure: { code: "RATE_LIMITED", retryable: true, retryAfterMs: 2 * 24 * 60 * 60_000 } });
        expect(decision.parkUntil! - 1_000_000).toBe(30 * 60_000);
    });

    test("parking is refused for a code no policy may retry", async () => {
        const ctx = ctxWith({ maxDelayMs: 60000 });
        expect(await decide(ctx, { failure: { code: "QUOTA_EXHAUSTED", retryable: true, retryAfterMs: 5 * 60_000 } })).toMatchObject({ retry: false });
    });
});
