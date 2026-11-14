// Receipts belong to the calling agent's session; no agent means no store.
/**
 * Returns the receipt scope of the calling session (its agent id), or null for session-less calls such as eval.
 *
 * Use to decide whether read may issue a readId and whether edit/write may resolve one.
 */
export default function (_ctx: Context, session: Session | null, _opts: {}): string | null {
    const id = session?.agent?.id ?? session?.agentId;
    return typeof id === "string" && id ? id : null;
}
