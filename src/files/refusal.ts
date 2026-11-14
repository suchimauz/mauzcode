// One shape for "the write did not happen and here is why", shared by the
// local and the SSH commit paths so callers can branch on `code`.
/**
 * Builds the Error thrown when files.write refuses: a failed precondition (conflict) or a lock not acquired (busy).
 *
 * The returned Error carries code, reason, lockPath and owner as own properties; read them with files.refusalOf.
 * @param opts.code conflict when a precondition failed; busy when the lock was not acquired in time.
 * @param opts.reason For conflict: changed, exists or absent.
 * @param opts.lockPath For busy: the lock directory to remove by hand if it is stale.
 * @param opts.owner For busy: the recorded lock owner.
 * @param opts.target File the write was aimed at, used in the message.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: types.files.WriteRefusal & {
        /** File the write was aimed at, used in the message. */
        target: string;
    },
): Error & types.files.WriteRefusal {
    const message = opts.code === "busy"
        ? `file is locked by another writer: ${opts.target} (lock ${opts.lockPath ?? "?"}, owner ${opts.owner || "unknown"}); nothing was written. Remove the lock directory only if that writer is gone.`
        : opts.reason === "exists" ? `file already exists: ${opts.target}; nothing was written`
        : opts.reason === "absent" ? `file does not exist: ${opts.target}; nothing was written`
        : `file changed since it was read: ${opts.target}; nothing was written — re-read and retry`;
    const err = new Error(message) as Error & types.files.WriteRefusal;
    err.code = opts.code;
    if (opts.reason) err.reason = opts.reason;
    if (opts.lockPath) err.lockPath = opts.lockPath;
    if (opts.owner) err.owner = opts.owner;
    return err;
}
