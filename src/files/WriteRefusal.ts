// Why files.write refused: thrown as an Error carrying these fields, so routes
// and tools can map it to 409/busy without parsing the message.
export type WriteRefusal = {
    /** conflict — a precondition failed; busy — the lock was not acquired in time. */
    code: "conflict" | "busy";
    /** For conflict: the file changed, already exists, or is missing. */
    reason?: "changed" | "exists" | "absent";
    /** For busy: the lock directory a person may remove if it is stale. */
    lockPath?: string;
    /** For busy: the recorded owner of the lock. */
    owner?: string;
};
