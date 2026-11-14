/**
 * Formats the one-line readId header shown to the model: `readId: <id> · lines a-b of N · complete|partial`.
 *
 * @param opts.receipt Receipt to describe.
 */
export default function (_ctx: Context, _session: Session | null, opts: { /** Receipt to describe. */ receipt: types.files.Receipt }): string {
    const r = opts.receipt;
    const range = r.end >= r.start ? `lines ${r.start}-${Math.min(r.end, r.totalLines)}` : "no lines";
    return `readId: ${r.id} · ${range} of ${r.totalLines} · ${r.complete ? "complete" : "partial"}`;
}
