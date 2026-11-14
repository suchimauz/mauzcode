const TTL_MS = 30 * 60 * 1000;
const MAX_PER_SESSION = 500;
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * Stores an in-memory read receipt for the calling session and returns it with a fresh short readId.
 *
 * Use when a read tool delivered a text range to an agent. Returns null without a session. Receipts slide on use (30 minutes) and are capped per session with least-recently-used eviction; they are lost on restart.
 * @param opts.snapshot Snapshot of the version that was delivered (from files.snapshot).
 * @param opts.start First delivered line, one-based. @minimum 1
 * @param opts.end Last delivered line, inclusive (may be the empty element after a final newline). @minimum 0
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Snapshot of the version that was delivered (from files.snapshot). */
        snapshot: types.files.Snapshot;
        /** First delivered line, one-based. @minimum 1 */
        start: number;
        /** Last delivered line, inclusive. @minimum 0 */
        end: number;
    },
): types.files.Receipt | null {
    const key = ctx.fns.files.receiptKey({});
    const snap = opts.snapshot;
    if (!key || !snap.exists || snap.binary || !snap.version) return null;
    const st = ((ctx.state as any).files ??= {}) as types.files.State;
    const all = (st.receipts ??= new Map());
    let mine = all.get(key);
    if (!mine) { mine = new Map(); all.set(key, mine); }
    const now = Date.now();
    for (const [id, r] of mine) if (r.expiresAt <= now) mine.delete(id);
    let id = "";
    do {
        const bytes = crypto.getRandomValues(new Uint8Array(8));
        id = "r" + Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
    } while (mine.has(id));
    // The LF view of "a\nb\n" has an empty third element; a person counts 2 lines.
    const totalLines = snap.finalNewline ? snap.lines.length - 1 : snap.lines.length;
    const receipt: types.files.Receipt = {
        id, sessionKey: key, host: snap.host, path: snap.path, version: snap.version,
        start: opts.start, end: opts.end, totalLines,
        complete: opts.start <= 1 && opts.end >= totalLines,
        eol: snap.eol, finalNewline: snap.finalNewline, bom: snap.bom,
        expiresAt: now + TTL_MS,
    };
    mine.set(id, receipt);
    while (mine.size > MAX_PER_SESSION) mine.delete(mine.keys().next().value!);
    return receipt;
}
