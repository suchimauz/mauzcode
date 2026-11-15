/**
 * Reads the instance-wide RTK control record: owner enable intent, latest availability check and revision.
 *
 * Use to show RTK settings or to decide whether local bash preparation may consult RTK. Read-only: it never probes,
 * enables or changes anything. A missing record reads as the default-off state.
 */
export default async function (ctx: Context, _session: Session | null, _opts: {} = {}): Promise<types.rtk.Control> {
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT enabled, revision, availability, path, version, reason, checked_at FROM rtk_control WHERE id = 1', params: [] }) as Array<{ enabled: boolean; revision: number | string; availability: types.rtk.Control['availability']; path: string | null; version: string | null; reason: string | null; checked_at: number | string | null }>;
    const r = rows[0];
    if (!r) return { enabled: false, revision: 0, availability: 'unknown', path: null, version: null, reason: null, checkedAt: null };
    return { enabled: r.enabled === true, revision: Number(r.revision), availability: r.availability, path: r.path, version: r.version, reason: r.reason, checkedAt: r.checked_at == null ? null : Number(r.checked_at) };
}
