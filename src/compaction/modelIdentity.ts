/**
 * Resolve a compaction model to its enabled stored connection and cached capabilities.
 *
 * Use before compaction or context-limit lookup. Delegates exclusively to the public
 * route resolver; malformed, legacy, disabled and unknown routes propagate unchanged.
 * @param opts.model Stored provider/account:model route.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Stored provider/account:model route. */
        model: string;
    },
): Promise<types.models.ResolvedRoute> {
    return ctx.fns.models.resolveRoute({ route: opts.model });
}
