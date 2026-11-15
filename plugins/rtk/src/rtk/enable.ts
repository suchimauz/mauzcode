/**
 * Enables RTK for local bash calls only after a fresh successful availability check in the same operation.
 *
 * Use for the owner's enable action after authorization and CSRF checks. Snapshots the revision and plugin lifecycle,
 * probes RTK, and commits enabled=true only if neither changed meanwhile: a disable, failure or plugin stop during the
 * probe wins. A failed probe records unavailability and leaves RTK disabled. Never installs anything or edits RTK or
 * agent permission files.
 */
export default async function (ctx: Context, _session: Session | null, _opts: {} = {}): Promise<{ ok: boolean; control: types.rtk.Control; error: 'unavailable' | 'stale' | null; reason: string | null }> {
    return await ctx.fns.rtk.serial({
        run: async (): Promise<{ ok: boolean; control: types.rtk.Control; error: 'unavailable' | 'stale' | null; reason: string | null }> => {
            const state = (ctx.state.rtk ??= {});
            const generation = state.generation ?? 0;
            const before = await ctx.fns.rtk.status({});
            const probe = await ctx.fns.rtk.probe({});
            if ((state.generation ?? 0) !== generation) return { ok: false, control: await ctx.fns.rtk.status({}), error: 'stale' as const, reason: 'The RTK plugin was reloaded during the check; nothing was enabled.' };
            if (!probe.ok) {
                const control = await ctx.fns.rtk.commit({ expectedRevision: before.revision, probe, enabled: false });
                return { ok: false, control: control ?? await ctx.fns.rtk.status({}), error: 'unavailable' as const, reason: probe.reason };
            }
            const control = await ctx.fns.rtk.commit({ expectedRevision: before.revision, probe, enabled: true });
            if (!control) return { ok: false, control: await ctx.fns.rtk.status({}), error: 'stale' as const, reason: 'RTK state changed during the check (for example it was disabled); nothing was enabled.' };
            state.verifiedRevision = control.revision;
            return { ok: true, control, error: null, reason: null };
        },
    }) as { ok: boolean; control: types.rtk.Control; error: 'unavailable' | 'stale' | null; reason: string | null };
}
