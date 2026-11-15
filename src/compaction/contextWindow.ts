/**
 * Return the effective input context window for an enabled stored model route.
 *
 * Use to derive auto-compaction thresholds and context displays. Uses the owner override
 * for the model on its connection, then cached provider metadata, then a public model
 * catalogue value, then 200,000 tokens
 * (models.resolveRoute owns the precedence); resolution failures are not treated as
 * missing limits.
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
    return route.contextLimit?.effective ?? route.contextWindow ?? 200_000;
}
