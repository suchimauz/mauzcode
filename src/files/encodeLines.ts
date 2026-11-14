// Inverse of files.snapshot: lines with their own terminators back to the raw
// text that goes on disk, BOM included.
/**
 * Encodes snapshot-style lines (text plus per-line terminator) back into raw file text, restoring the BOM.
 *
 * Use after editing snapshot lines so untouched lines keep their original bytes.
 * @param opts.lines Lines in order; eol is the terminator after each line ("" for none).
 * @param opts.bom Prefix the UTF-8 byte order mark. @default false
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Lines in order; eol is the terminator after each line ("" for none). */
        lines: { text: string; eol: string }[];
        /** Prefix the UTF-8 byte order mark. @default false */
        bom?: boolean;
    },
): string {
    return (opts.bom ? "\uFEFF" : "") + opts.lines.map(l => l.text + l.eol).join("");
}
