/**
 * Run a connection health check once per revision with a 60-second cache
 *
 * Internal helper for models.test and models.usage. Keys entries by connection id, a hash of its id and updatedAt, and the check kind; concurrent callers share one in-flight promise, stale revisions of the same connection are dropped, and failures are not cached.
 * @param opts.connection Connection identity and revision.
 * @param opts.kind Which check is cached.
 * @param opts.run Performs the check when no fresh result exists.
 * @param opts.reuse Return a fresh cached result instead of running again. @default true
 * @param opts.ttlMs Cache lifetime in milliseconds. @default 60000 @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection identity and revision. */
        connection: { id: string; updatedAt: number };
        /** Which check is cached. */
        kind: "test" | "usage";
        /** Performs the check when no fresh result exists. */
        run: () => Promise<types.models.UsageReport | types.models.TestResult>;
        /** Return a fresh cached result instead of running again. @default true */
        reuse?: boolean;
        /** Cache lifetime in milliseconds. @default 60000 @minimum 0 */
        ttlMs?: number;
    },
): Promise<types.models.UsageReport | types.models.TestResult> {
    return ctx.fns.models.connections.cached(opts);
}
