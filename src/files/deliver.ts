// What `read` shows for text, and what edit/write show again after a conflict:
// a readId header line, then the same body read always returned.
/**
 * Renders a snapshot line range as read-tool text (plain or hashline) and issues a readId receipt for it when a session exists.
 *
 * The first line is `readId: <id> · lines a-b of N · complete|partial` when a receipt was issued; session-less calls get the body alone. Use from read and from guarded edit/write conflict responses.
 * @param opts.snapshot Snapshot to render (from files.snapshot); must be text.
 * @param opts.startLine First line to deliver, one-based. @default 1 @minimum 1
 * @param opts.endLine Last line to deliver, inclusive; omitted means end of file. @minimum 1
 * @param opts.maxLines Maximum number of lines to deliver. @minimum 1
 * @param opts.hashline Prefix each line with its anchor. @default false
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Snapshot to render (from files.snapshot); must be text. */
        snapshot: types.files.FileSnapshot;
        /** First line to deliver, one-based. @default 1 @minimum 1 */
        startLine?: number;
        /** Last line to deliver, inclusive; omitted means end of file. @minimum 1 */
        endLine?: number;
        /** Maximum number of lines to deliver. @minimum 1 */
        maxLines?: number;
        /** Prefix each line with its anchor. @default false */
        hashline?: boolean;
    },
): { text: string; body: string; receipt: types.files.Receipt | null } {
    const snap = opts.snapshot;
    const lines = snap.lines;
    const start = Math.max(1, Math.floor(opts.startLine ?? 1));
    let end = Math.max(start, Math.floor(opts.endLine ?? lines.length));
    if (opts.maxLines != null) end = Math.min(end, start + Math.max(0, Math.floor(opts.maxLines) - 1));
    end = Math.min(end, lines.length);
    const slice = lines.slice(start - 1, end);
    const body = opts.hashline
        ? slice.map((l, i) => `${ctx.fns.files.formatHashline({ line: start + i, text: l.text }).anchor}|${l.text}`).join("\n")
        : slice.map(l => l.text).join("\n");
    const receipt = ctx.fns.files.issueReceipt({ snapshot: snap, start, end: Math.max(end, start - 1) });
    if (!receipt) return { text: body, body, receipt: null };
    return { text: ctx.fns.files.receiptLine({ receipt }) + "\n" + body, body, receipt };
}
