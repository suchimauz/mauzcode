/**
 * Applies one revision-checked transition to the RTK control record and returns the new state, or null when stale.
 *
 * Use from RTK state operations only. The update succeeds only while the stored revision still equals
 * `expectedRevision` (pass null to apply unconditionally, as disable does); every successful write increments the
 * revision, so a check or enable that started before a newer transition can never overwrite it.
 * @param opts.expectedRevision Revision observed when the operation started; null applies unconditionally.
 * @param opts.enabled New owner intent; omitted keeps it.
 * @param opts.probe Availability result to record; omitted keeps the stored availability facts.
 * @param opts.reason Safe reason to record when no probe is given (e.g. a technical disablement); omitted keeps it.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Revision observed when the operation started; null applies unconditionally. */
        expectedRevision: number | null;
        /** New owner intent; omitted keeps it. */
        enabled?: boolean;
        /** Availability result to record; omitted keeps the stored availability facts. */
        probe?: types.rtk.ProbeResult;
        /** Safe reason to record when no probe is given (e.g. a technical disablement); omitted keeps it. */
        reason?: string | null;
    },
): Promise<types.rtk.Control | null> {
    const sets: string[] = ['revision = revision + 1', 'updated_at = ?'];
    const params: unknown[] = [Date.now()];
    if (opts.enabled !== undefined) { sets.push('enabled = ?'); params.push(opts.enabled); }
    if (opts.probe) {
        sets.push('availability = ?', 'path = ?', 'version = ?', 'reason = ?', 'checked_at = ?');
        params.push(opts.probe.ok ? 'available' : 'unavailable', opts.probe.path?.slice(0, 4096) ?? null, opts.probe.version?.slice(0, 200) ?? null, opts.probe.reason?.slice(0, 500) ?? null, Date.now());
    } else if (opts.reason !== undefined) { sets.push('reason = ?'); params.push(opts.reason?.slice(0, 500) ?? null); }
    let where = 'id = 1';
    if (opts.expectedRevision !== null) { where += ' AND revision = ?'; params.push(opts.expectedRevision); }
    await ctx.fns.procs.db.run({ sql: 'INSERT INTO rtk_control (id) VALUES (1) ON CONFLICT (id) DO NOTHING', params: [] });
    const res = await ctx.fns.procs.db.run({ sql: `UPDATE rtk_control SET ${sets.join(', ')} WHERE ${where} RETURNING id`, params }) as { changes: number };
    if (!res.changes) return null;
    return await ctx.fns.rtk.status({});
}
