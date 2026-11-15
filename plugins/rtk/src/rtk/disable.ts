/**
 * Disables RTK for local bash calls immediately and invalidates any enable or check still in progress.
 *
 * Use for the owner's disable action, or with a reason when a technical preparation failure must turn RTK off.
 * Unconditional and not queued behind running checks: the revision bump makes their late results stale. Re-enabling
 * always requires rtk.enable with a fresh check; a later healthy binary never re-enables RTK by itself.
 * @param opts.reason Safe reason to show owners, e.g. a technical failure; omitted keeps the stored reason.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Safe reason to show owners, e.g. a technical failure; omitted keeps the stored reason. */
        reason?: string;
    } = {},
): Promise<types.rtk.Control> {
    const control = await ctx.fns.rtk.commit({ expectedRevision: null, enabled: false, ...(opts.reason === undefined ? {} : { reason: opts.reason }) });
    delete (ctx.state.rtk ??= {}).verifiedRevision;
    return control ?? await ctx.fns.rtk.status({});
}
