/**
 * Run a connection health check once per revision with a 60-second cache
 *
 * Internal helper for models.test and models.usage. Keys entries by connection id, a hash of its id and updatedAt, and the check kind; concurrent callers share one in-flight promise, stale revisions of the same connection are dropped, and failures are not cached. `run` receives the previous cached result of the same revision (fresh or expired) so partial observations can merge into it; `preserveExpiry` keeps that entry's expiry so partial updates never postpone the next full check.
 * @param opts.connection Connection identity and revision.
 * @param opts.kind Which check is cached.
 * @param opts.run Performs the check when no fresh result exists; receives the previous cached result, if any.
 * @param opts.reuse Return a fresh cached result instead of running again. @default true
 * @param opts.ttlMs Cache lifetime in milliseconds. @default 60000 @minimum 0
 * @param opts.preserveExpiry Keep the previous entry's expiry instead of starting a new TTL (a new TTL is used only when nothing was cached). @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection identity and revision. */
        connection: { id: string; updatedAt: number };
        /** Which check is cached. */
        kind: "test" | "usage";
        /** Performs the check when no fresh result exists; receives the previous cached result, if any. */
        run: (previous?: types.models.UsageReport | types.models.TestResult) => Promise<types.models.UsageReport | types.models.TestResult>;
        /** Return a fresh cached result instead of running again. @default true */
        reuse?: boolean;
        /** Cache lifetime in milliseconds. @default 60000 @minimum 0 */
        ttlMs?: number;
        /** Keep the previous entry's expiry instead of starting a new TTL (a new TTL is used only when nothing was cached). @default false */
        preserveExpiry?: boolean;
    },
): Promise<types.models.UsageReport | types.models.TestResult> {
    const health = ((ctx.state.models ??= {}).health ??= {});
    const { id, updatedAt } = opts.connection;
    const revision = `${id}:${Bun.hash(`${id}:${updatedAt}`).toString(36)}`;
    for (const k of Object.keys(health)) if (k.startsWith(`${id}:`) && !k.startsWith(`${revision}:`)) delete health[k];
    const key = `${revision}:${opts.kind}`;
    const hit = health[key];
    if (hit?.pending) return await hit.pending;
    if (opts.reuse !== false && hit?.result && hit.expiresAt > Date.now()) return hit.result;
    const previous = hit?.result ? { result: hit.result, expiresAt: hit.expiresAt } : undefined;
    const pending = opts.run(previous?.result);
    health[key] = { expiresAt: 0, pending };
    try {
        const result = await pending;
        const expiresAt = opts.preserveExpiry && previous ? previous.expiresAt : Date.now() + (opts.ttlMs ?? 60000);
        if (health[key]?.pending === pending) health[key] = { expiresAt, result };
        return result;
    } catch (error) {
        if (health[key]?.pending === pending) delete health[key];
        throw error;
    }
}
