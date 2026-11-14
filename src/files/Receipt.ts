// A read receipt: proof of which version of which file, and which lines of it,
// a session was shown. Version references, not permissions.
export type Receipt = {
    /** Short random id handed to the model as `readId`. */
    id: string;
    /** Owning session key (the agent id). */
    sessionKey: string;
    /** Remote host alias, or undefined for local. */
    host?: string;
    /** Absolute local path, or remote path as given. */
    path: string;
    /** sha256 hex of the raw bytes that were read. */
    version: string;
    /** First delivered line, one-based. */
    start: number;
    /** Last delivered line, inclusive. */
    end: number;
    /** Line count of the whole file, not counting the empty element after a final newline. */
    totalLines: number;
    /** Lines 1..totalLines were all delivered. */
    complete: boolean;
    /** Dominant line ending of that version. */
    eol: "\n" | "\r\n";
    /** That version ended with a line break. */
    finalNewline: boolean;
    /** That version started with a BOM. */
    bom: boolean;
    /** Epoch ms after which the receipt is gone; slides forward on use. */
    expiresAt: number;
};
