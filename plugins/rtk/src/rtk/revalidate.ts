/**
 * Confirms that an enabled RTK state may be used by this process, probing once after restart, reload or any change.
 *
 * Use before the first RTK use of a persisted enabled state. Returns ready:false when RTK is disabled. When the
 * current revision was not yet verified in this process lifecycle, runs rtk.probe; failure disables RTK with a safe
 * reason, success marks the revision verified without changing owner intent. Disabled state is never re-enabled here.
 * A probe that runs out of a caller-shortened budget (`timeoutMs` below the standard 5 s) is not RTK's fault: it
 * returns `expired: true` without recording anything or disabling RTK.
 * @param opts.timeoutMs Probe budget in milliseconds, e.g. the time left before a bash call's deadline.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Probe budget in milliseconds, e.g. the time left before a bash call's deadline. @default 5000 @minimum 1 @maximum 5000 */
        timeoutMs?: number;
    } = {},
): Promise<{ ready: boolean; control: types.rtk.Control; probed: boolean; expired?: boolean }> {
    const budget = Math.min(Math.max(1, Math.floor(opts.timeoutMs ?? 5000)), 5000);
    const state = (ctx.state.rtk ??= {});
    const current = await ctx.fns.rtk.status({});
    if (!current.enabled) return { ready: false, control: current, probed: false };
    if (state.verifiedRevision === current.revision) return { ready: true, control: current, probed: false };
    return await ctx.fns.rtk.serial({
        run: async (): Promise<{ ready: boolean; control: types.rtk.Control; probed: boolean; expired?: boolean }> => {
            const generation = state.generation ?? 0;
            const before = await ctx.fns.rtk.status({});
            if (!before.enabled) return { ready: false, control: before, probed: false };
            if (state.verifiedRevision === before.revision) return { ready: true, control: before, probed: false };
            const probe = await ctx.fns.rtk.probe({ timeoutMs: budget });
            if (!probe.ok && probe.code === 'timeout' && budget < 5000) return { ready: false, control: before, probed: true, expired: true };
            if (!probe.ok) {
                const control = await ctx.fns.rtk.commit({ expectedRevision: null, probe, enabled: false });
                delete state.verifiedRevision;
                return { ready: false, control: control ?? await ctx.fns.rtk.status({}), probed: true };
            }
            const control = await ctx.fns.rtk.commit({ expectedRevision: before.revision, probe });
            if (!control || !control.enabled || (state.generation ?? 0) !== generation) return { ready: false, control: control ?? await ctx.fns.rtk.status({}), probed: true };
            state.verifiedRevision = control.revision;
            return { ready: true, control, probed: true };
        },
    }) as { ready: boolean; control: types.rtk.Control; probed: boolean; expired?: boolean };
}
