/**
 * Remove a voice connection and delete every secret it owns
 *
 * Use when the owner deletes a connection. Deletes the row and all secrets it owns in one transaction. Throws
 * `NOT_FOUND` for unknown ids. Other connections, chats and routes are not affected.
 * @param opts.id Connection UUID.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
    },
): Promise<{ removed: string }> {
    return ctx.fns.voice.connections.remove(opts);
}
