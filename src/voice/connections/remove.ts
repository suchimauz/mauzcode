/**
 * Remove a voice connection and delete every secret it owns
 *
 * Use when the owner deletes a connection. Deletes the row and all `secret://voice/<id>.*` entries in one
 * transaction. Throws `NOT_FOUND` for unknown ids. Other connections, chats and routes are not affected.
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
    const { id } = await ctx.fns.voice.connections.get({ id: opts.id });
    await ctx.fns.procs.db.transaction({ fn: async () => {
        const rows = await ctx.fns.procs.db.select({ sql: "DELETE FROM voice_connections WHERE id=? RETURNING secrets", params: [id] });
        if (!rows[0]) throw Object.assign(new Error("Voice connection not found"), { code: "NOT_FOUND", status: 404 });
        const presence: Record<string, unknown> = typeof rows[0].secrets === "string" ? JSON.parse(rows[0].secrets) : ((rows[0].secrets ?? {}) as Record<string, unknown>);
        for (const key of Object.keys(presence)) await ctx.fns.secrets.deleteLocal({ namespace: "voice", name: `${id}.${key}` });
        // Also catch secrets of fields no longer referenced (e.g. a provider schema change).
        await ctx.fns.procs.db.run({ sql: "DELETE FROM local_secrets WHERE namespace='voice' AND starts_with(name, ?)", params: [`${id}.`] });
    } });
    return { removed: id };
}
