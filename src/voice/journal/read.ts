/**
 * Serve owner-only recent voice diagnostics or an exact reference.
 *
 * Filter both reads at the seven-day boundary. Return at most the newest 100 records with no browser caching; a supplied expired or absent reference returns 404.
 * @param opts.id Exact opaque reference; omit to list the newest unexpired diagnostics.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact opaque reference; omit to list the newest unexpired diagnostics. */
        id?: string;
    },
): Promise<Response> {
    const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
    const user = (session as (Session & { user?: { id: string; role?: string; disabledAt?: number | null } }) | null)?.user;
    if (!user?.id || user.disabledAt != null) return reply({ error: "Unauthorized" }, 401);
    if (user.role !== "owner") return reply({ error: "Forbidden" }, 403);
    const { id } = opts;
    const missing = () => reply({ error: "Voice error not found" }, 404);
    if (id !== undefined && !/^[0-9a-f]{16}$/.test(id)) return missing();
    const cutoff = Date.now() - 7 * 86400000;
    const select = "SELECT id, created_at, provider, model, stage, cause FROM voice_error_journal WHERE created_at > ?";
    try {
        const rows = await ctx.fns.procs.db.select({ sql: id === undefined ? select + " ORDER BY created_at DESC, id DESC LIMIT 100" : select + " AND id = ?", params: id === undefined ? [cutoff] : [cutoff, id] });
        const errors = rows.map(row => ({ id: row.id, createdAt: new Date(Number(row.created_at)).toISOString(), provider: row.provider, model: row.model, stage: row.stage, cause: row.cause }));
        return id === undefined ? reply({ errors }) : errors[0] ? reply({ error: errors[0] }) : missing();
    } catch { return reply({ error: "Voice diagnostics unavailable" }, 503); }
}
