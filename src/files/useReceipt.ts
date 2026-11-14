const TTL_MS = 30 * 60 * 1000;

/**
 * Resolves a readId for the calling session and slides its lifetime; null when unknown, expired, evicted or another session's.
 *
 * Use at the start of a guarded edit or replace. With retire the receipt is removed instead of extended (after a conflict or a successful edit that issues a new one).
 * @param opts.readId Receipt id returned by read.
 * @param opts.retire Remove the receipt instead of extending it. @default false
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Receipt id returned by read. */
        readId: string;
        /** Remove the receipt instead of extending it. @default false */
        retire?: boolean;
    },
): types.files.Receipt | null {
    const key = ctx.fns.files.receiptKey({});
    if (!key) return null;
    const mine = ((ctx.state as any).files as types.files.State | undefined)?.receipts?.get(key);
    const id = String(opts.readId ?? "").trim();
    const r = mine?.get(id);
    if (!mine || !r) return null;
    mine.delete(id);
    if (r.expiresAt <= Date.now()) return null;
    if (opts.retire) return r;
    r.expiresAt = Date.now() + TTL_MS;
    mine.set(id, r); // re-insert: most recently used goes last
    return r;
}
