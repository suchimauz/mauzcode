import { describe, expect, test } from "bun:test";
import schedule from "./retrySchedule";
import wait from "./retryWait";
import retryDecision from "./retryDecision";
import retryCodes from "./retryCodes";

// The real decision function over a stubbed settings chain: the policy here is the
// default one, so these tests exercise the shipped numbers rather than a fake.
function retryPolicyContext(parts: { procs: any; session: any }) {
    const ctx: any = { fns: { ...parts, settings: { get: async () => undefined }, procs: { ...parts.procs, log: { warn: () => {} } }, agent: {} } };
    ctx.fns.agent.retryCodes = (o: any) => retryCodes(ctx, null, o);
    ctx.fns.agent.retryDecision = (o: any) => retryDecision(ctx, null, o);
    return ctx;
}

// In-memory DB boundary: preserve transaction rollback and enforce row-lock ordering.
// No live agents or database records are touched by these lifecycle tests.
function fixture(attempt = 0, error: any = { code: "SERVER", retryable: true }) {
    const row = { llm_retry_attempt: attempt, llm_retry_pending: null as any, stopped_at: null as string | null, run_token: "lease", model: null as string | null };
    const events: any[] = [];
    let locked = false;
    let failEvent = false;
    let beforeLock: (() => void) | undefined;
    const ctx: any = retryPolicyContext({
        procs: { db: {
            transaction: async ({ fn }: any) => {
                const snapshot = structuredClone(row);
                const length = events.length;
                locked = true;
                try { return await fn(); }
                catch (thrown) { Object.assign(row, snapshot); events.splice(length); throw thrown; }
                finally { locked = false; }
            },
            select: async ({ sql, params }: any) => {
                expect(params).toEqual(["retry-test"]);
                if (sql.includes("FOR UPDATE")) {
                    expect(locked).toBe(true);
                    beforeLock?.();
                }
                return [structuredClone(row)];
            },
            run: async ({ sql, params }: any) => {
                expect(locked).toBe(true);
                if (sql.includes("llm_retry_attempt = ?")) {
                    expect(params[2]).toBe("retry-test");
                    row.llm_retry_attempt = params[0];
                    row.llm_retry_pending = JSON.parse(params[1]);
                } else if (sql.includes("llm_retry_pending = NULL")) {
                    expect(params).toEqual(["retry-test"]);
                    row.llm_retry_pending = null;
                } else throw new Error(`Unexpected write: ${sql}`);
            },
        } },
        session: { appendEvent: async ({ id, event }: any) => {
            expect(locked).toBe(true);
            expect(id).toBe("retry-test");
            if (failEvent) throw new Error("event persistence failed");
            events.push(structuredClone(event));
        } },
    });
    const controller = new AbortController();
    const opts = { agentId: "retry-test", runToken: "lease", signal: controller.signal };
    return { row, events, controller,
        schedule: () => schedule(ctx, null, { ...opts, error }),
        wait: () => wait(ctx, null, opts),
        failEvents: () => { failEvent = true; },
        beforeLock: (fn: () => void) => { beforeLock = fn; },
    };
}

function pending(until = Date.now() - 1) {
    return { type: "llm_retry", retryId: "persisted-retry", retry: 4, until };
}

describe("agent retry lifecycle", () => {
    test("schedules from the durable attempt and persists the complete matching event", async () => {
        const f = fixture(3);
        expect(await f.schedule()).toEqual({ scheduled: true });
        expect(f.row.llm_retry_attempt).toBe(4);
        expect(f.row.llm_retry_pending).toEqual(f.events[0]);
        expect(f.events[0]).toMatchObject({ type: "llm_retry", retry: 4, maxRetries: 5, mode: "normal", failure: { code: "SERVER" } });
        expect(f.events[0].retryId).toMatch(/^[0-9a-f-]{36}$/);
        expect(f.events[0].delayMs).toBeGreaterThan(0);
        expect(f.events[0].until).toBeGreaterThan(Date.now() - 1);
        await f.schedule();
        expect(f.row.llm_retry_attempt).toBe(5);
        expect(f.events[1].retryId).not.toBe(f.events[0].retryId);
    });

    test("a non-retryable code refuses without touching durable state", async () => {
        const f = fixture(0, { code: "AUTH", retryable: false });
        expect(await f.schedule()).toEqual({ scheduled: false });
        expect(f.row.llm_retry_attempt).toBe(0);
        expect(f.events).toHaveLength(0);
    });

    test("a code no policy may retry is refused even when it looks transient", async () => {
        const f = fixture(0, { code: "OVERFLOW", retryable: true });
        expect(await f.schedule()).toEqual({ scheduled: false });
        expect(f.events).toHaveLength(0);
    });

    for (const reason of ["stop", "revoked lease", "abort"] as const) {
        for (const operation of ["schedule", "wait"] as const) {
            test(`${operation} fences ${reason} without writes or events`, async () => {
                const f = fixture(3);
                f.row.llm_retry_pending = pending();
                if (reason === "stop") f.row.stopped_at = "stopped";
                if (reason === "revoked lease") f.row.run_token = "replacement";
                if (reason === "abort") f.controller.abort();
                const snapshot = structuredClone(f.row);
                await expect(f[operation]()).rejects.toMatchObject({ name: "AbortError" });
                expect(f.row).toEqual(snapshot);
                expect(f.events).toEqual([]);
            });
        }
    }

    test("recovery honors the persisted deadline and emits one start marker without resetting attempts", async () => {
        const f = fixture(4);
        const until = Date.now() + 35;
        f.row.llm_retry_pending = pending(until);
        await f.wait();
        expect(Date.now()).toBeGreaterThanOrEqual(until);
        expect(f.events).toEqual([{ type: "llm_retry_started", retryId: "persisted-retry", retry: 4 }]);
        expect(f.row.llm_retry_pending).toBeNull();
        expect(f.row.llm_retry_attempt).toBe(4);
        await f.wait();
        expect(f.events).toHaveLength(1);
    });

    test("recovery starts an expired deadline immediately and no pending retry is a no-op", async () => {
        const f = fixture(4);
        await f.wait();
        expect(f.events).toEqual([]);
        f.row.llm_retry_pending = pending();
        await f.wait();
        expect(f.events).toHaveLength(1);
        expect(f.row.llm_retry_pending).toBeNull();
    });

    test("a replaced pending retry cannot be marked started by a stale waiter", async () => {
        const f = fixture(4);
        f.row.llm_retry_pending = pending();
        f.beforeLock(() => { f.row.llm_retry_pending = { ...pending(), retryId: "replacement" }; });
        await f.wait();
        expect(f.events).toEqual([]);
        expect(f.row.llm_retry_pending.retryId).toBe("replacement");
    });

    test("abort interrupts a long recovered wait without a start marker", async () => {
        const f = fixture(4);
        f.row.llm_retry_pending = pending(Date.now() + 60_000);
        const waiting = f.wait();
        const abortTimer = setTimeout(() => f.controller.abort(), 5);
        try { await expect(waiting).rejects.toMatchObject({ name: "AbortError" }); }
        finally { clearTimeout(abortTimer); }
        expect(f.events).toEqual([]);
        expect(f.row.llm_retry_pending.retryId).toBe("persisted-retry");
    });

    for (const operation of ["schedule", "wait"] as const) {
        test(`${operation} rolls back durable state when event persistence fails`, async () => {
            const f = fixture(4);
            f.row.llm_retry_pending = pending();
            const snapshot = structuredClone(f.row);
            f.failEvents();
            await expect(f[operation]()).rejects.toThrow("event persistence failed");
            expect(f.row).toEqual(snapshot);
            expect(f.events).toEqual([]);
        });
    }
});
