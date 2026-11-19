/**
 * Read one voice connection without secret values
 *
 * Use to show or edit a single connection. Throws an error with `code: "NOT_FOUND"` when the id is malformed or
 * unknown. Secret fields are reported only as set/not set.
 * @param opts.id Connection UUID.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
    },
): Promise<types.voice.ConnectionView> {
    const id = String(opts.id ?? "");
    const rows = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        ? await ctx.fns.procs.db.select({ sql: "SELECT * FROM voice_connections WHERE id=?", params: [id] })
        : [];
    if (!rows[0]) throw Object.assign(new Error("Voice connection not found"), { code: "NOT_FOUND", status: 404 });
    return ctx.fns.voice.connections.toView({ row: rows[0] });
}
