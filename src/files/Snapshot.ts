// What files.snapshot saw of a file at one moment: the exact version (sha256 of
// the raw bytes) plus the line structure needed to edit it without touching the
// bytes of lines nobody asked to change.
export type Snapshot = {
    /** Remote host alias, or undefined for the local machine. */
    host?: string;
    /** Absolute local path, or the remote path as given (relative to the remote home). */
    path: string;
    /** False when nothing exists at the path. */
    exists: boolean;
    /** sha256 hex of the raw bytes; null when the file does not exist. */
    version: string | null;
    /** True for content that is not text: a NUL byte or invalid UTF-8. */
    binary: boolean;
    /** Raw byte size. */
    size: number;
    /** File starts with a UTF-8 byte order mark. */
    bom: boolean;
    /** Dominant line ending, "\n" when the file has none. */
    eol: "\n" | "\r\n";
    /** Body ends with a line break. */
    finalNewline: boolean;
    /** Lines without the BOM; `eol` is the terminator that followed each one ("" for the last). */
    lines: { text: string; eol: string }[];
    /** The LF view the tools show: line texts joined by "\n". */
    text: string;
};
