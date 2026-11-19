/**
 * Purge voice diagnostics that have reached seven days of age.
 *
 * Scheduled maintenance deletes expired diagnostics, including records that aged out while the instance was offline. Read endpoints enforce the same cutoff independently.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<void> {
    await ctx.fns.procs.db.run({ sql: "DELETE FROM voice_error_journal WHERE created_at <= ?", params: [Date.now() - 7 * 86400000] });
}
