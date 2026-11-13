/**
 * Remove a model connection and delete every secret it owns
 *
 * Use when the owner deletes a connection. Deletes the row and all `secret://models/<id>.*` entries in one transaction and drops its cached health. Throws `NOT_FOUND` for unknown ids. Existing LLM routes, accounts and agents are not affected.
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
    return ctx.fns.models.connections.remove(opts);
}
