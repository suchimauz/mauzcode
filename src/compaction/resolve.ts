/**
 * Select the provider-neutral compactor for an enabled stored model route.
 *
 * The default compactor dispatches through models.compact or models.call according
 * to resolved capabilities, never provider ids. The fallback flag means summary
 * compaction is required, not permission to retry a failed native request elsewhere.
 * @param opts.model Stored provider/account:model route.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Stored provider/account:model route. */
        model: string;
    },
): Promise<types.compaction.CompactorEntry & { fallback: boolean }> {
    const route = await ctx.fns.models.resolveRoute({ route: opts.model });
    const compactors = (ctx.state as { compaction?: types.compaction.State }).compaction?.compactors;
    const compactor = compactors?.default;
    if (!compactor) throw new Error(`no default compactor for ${opts.model}: add $compaction_default.ts`);
    return { ...compactor, fallback: !route.nativeCompaction };
}
