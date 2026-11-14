/**
 * Return the cached input context window for an enabled stored model route.
 *
 * Use to derive auto-compaction thresholds. Defaults to 200,000 tokens only when
 * catalogue metadata is absent; resolution failures are not treated as missing limits.
 * @param opts.model Stored provider/account:model route.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Stored provider/account:model route. */
        model: string;
    },
): Promise<number> {
    const route = await ctx.fns.models.resolveRoute({ route: opts.model });
    return route.contextWindow ?? 200_000;
}
