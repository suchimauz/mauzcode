/**
 * Report a connection's usage in the standard shape, falling back to cached status
 *
 * Use for quota/balance displays. Disabled connections return status `disabled` without network. When the provider implements `usage`, returns its windows and balance normalized to the standard shape (percent clamped to 0–100); otherwise returns only status, reason and check time from the cached connection test. Results are cached for 60 s per connection revision; pass `refresh` to bypass. Provider failures become `unavailable` without secret values.
 * @param opts.id Connection UUID.
 * @param opts.refresh Ignore a cached result and query again. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Ignore a cached result and query again. @default false */
        refresh?: boolean;
    },
): Promise<types.models.UsageReport> {
    return ctx.fns.models.connections.usage(opts);
}
