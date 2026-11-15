/**
 * Checks RTK availability on the server PATH and records the result without ever enabling RTK.
 *
 * Use for the owner's Check RTK action. Runs rtk.probe, then records path, version, time and a safe failure reason.
 * A failed check also turns an enabled integration off. A successful check never turns it on; enabling needs
 * rtk.enable. A result that became stale because another transition happened meanwhile is discarded and the current
 * state is returned with `stale: true`.
 */
export default async function (ctx: Context, _session: Session | null, _opts: {} = {}): Promise<{ control: types.rtk.Control; probe: types.rtk.ProbeResult; stale: boolean }> {
    return await ctx.fns.rtk.serial({
        run: async (): Promise<{ control: types.rtk.Control; probe: types.rtk.ProbeResult; stale: boolean }> => {
            const before = await ctx.fns.rtk.status({});
            const probe = await ctx.fns.rtk.probe({});
            const control = await ctx.fns.rtk.commit({ expectedRevision: before.revision, probe, ...(probe.ok ? {} : { enabled: false }) });
            if (control && probe.ok && before.enabled && control.enabled && (ctx.state.rtk ??= {}).verifiedRevision === before.revision) ctx.state.rtk.verifiedRevision = control.revision;
            return { control: control ?? await ctx.fns.rtk.status({}), probe, stale: !control };
        },
    }) as { control: types.rtk.Control; probe: types.rtk.ProbeResult; stale: boolean };
}
