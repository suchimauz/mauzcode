/** Returns tool-call details for expanded chat rows and the native mobile details sheet.
 * Arguments are complete (never shortened) with secret-bearing values redacted; the result stays bounded.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters containing the agent id and event index.
 */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const id = opts.params.id!;
    const idx = Number(opts.params.idx);
    if (!Number.isInteger(idx) || idx < 0) return Response.json({ error: "invalid_event", message: "Invalid event index" }, { status: 400 });
    const row = ((await ctx.fns.procs.db.select({
        sql: "SELECT idx, type, payload, ts FROM events WHERE agent_id = ? AND idx = ?",
        params: [id, idx],
    })) as any[])[0];
    if (!row) return Response.json({ error: "not_found", message: "Event not found" }, { status: 404 });
    const event = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    if (event?.type !== "tool_call" && event?.type !== "tool_result") return Response.json({ error: "not_a_tool", message: "Event is not a tool call" }, { status: 400 });
    const truncate = (value: any, max: number) => {
        const text = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
        return { text: text.slice(0, max), truncated: text.length > max };
    };
    // Presentation and redaction come from the same resolver as the rows; the
    // arguments are the model's own output, so they are shown in full.
    const shown = ctx.fns.tools.presentation({ name: String(event.name ?? "tool"), args: event.args, redactArgs: true });
    const redacted = event.args && typeof event.args === "object" ? shown.args : event.args;
    const args = truncate(redacted, Number.POSITIVE_INFINITY);
    const result = truncate(event.result ?? event.text ?? "", 120_000);
    return Response.json({
        version: 1,
        event: {
            idx: Number(row.idx), ts: Number(row.ts), type: String(event.type), name: String(event.name ?? "tool"),
            label: shown.label, icon: shown.icon, category: shown.category, summary: shown.summary,
            args: args.text, argsTruncated: args.truncated,
            result: result.text, resultTruncated: result.truncated,
            isError: event.isError === true,
            ...(rtkDetails(event.details) ? { rtk: rtkDetails(event.details) } : {}),
        },
    });
}

/** Bash RTK preparation record (already secret-masked at the source), bounded for the details sheet. */
function rtkDetails(details: any): { outcome: string; original: string; executed: string | null; code: number | null; notice: string | null; diagnostic: string | null } | null {
    const r = details?.rtk;
    if (!r || typeof r !== "object") return null;
    const str = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : null;
    return {
        outcome: str(r.outcome, 40) ?? "unknown",
        original: str(r.original, 40_000) ?? "",
        executed: str(r.executed, 40_000),
        code: Number.isInteger(r.code) ? r.code : null,
        notice: str(r.notice, 1000),
        diagnostic: str(r.diagnostic, 1000),
    };
}
