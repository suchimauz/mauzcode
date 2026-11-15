/**
 * Read a connection's owner context-window overrides
 *
 * Returns the stored exact-model-id → token map (positive safe integers only; malformed entries are skipped). Overrides are owner configuration kept apart from the provider models cache, so refreshes never change them. Network-free. Before the column's migration has run it returns an empty map rather than failing. Fails with NOT_FOUND for an unknown connection.
 * @param opts.id Connection UUID.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
    },
): Promise<Record<string, number>> {
    const id = String(opts.id ?? "");
    const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let rows: { model_context_overrides: unknown }[] = [];
    try {
        rows = valid ? await ctx.fns.procs.db.select({ sql: "SELECT model_context_overrides FROM llm_connections WHERE id=?", params: [id] }) as { model_context_overrides: unknown }[] : [];
    } catch (error) {
        // Code hot-reloaded before its migration ran: no overrides yet, so route resolution keeps working.
        const e = error as { code?: unknown; errno?: unknown } | null;
        if (e?.code !== "42703" && e?.errno !== "42703" && !/model_context_overrides/.test(String((error as Error)?.message))) throw error;
        ctx.fns.procs.log.warn({ event: "models.contextOverrides", msg: "model_context_overrides column missing; run migrations" });
        const exists = valid ? await ctx.fns.procs.db.select({ sql: "SELECT id FROM llm_connections WHERE id=?", params: [id] }) : [];
        if (!exists[0]) throw Object.assign(new Error("Connection not found"), { code: "NOT_FOUND", status: 404 });
        return {};
    }
    if (!rows[0]) throw Object.assign(new Error("Connection not found"), { code: "NOT_FOUND", status: 404 });
    let raw = rows[0].model_context_overrides;
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = {}; } }
    const out: Record<string, number> = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        for (const [model, value] of Object.entries(raw)) if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) out[model] = value;
    }
    return out;
}
