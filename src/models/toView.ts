/**
 * Project a stored llm_connections row into a secret-free connection view
 *
 * Use when returning connections to callers or clients. Reports each declared or stored secret field only as set/not set; never includes secret values or secret:// references.
 * @param opts.row Raw llm_connections row as returned by procs.db.select.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Raw llm_connections row as returned by procs.db.select. */
        row: Record<string, unknown>;
    },
): types.models.ConnectionView {
    return ctx.fns.models.connections.toView(opts);
}
