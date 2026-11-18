// Built-in summary formatters — for summaries a template cannot express.
//
// Named and reviewed here, in core, rather than as free-form code in a
// declaration: a declaration says `summary: "@read"` and every surface gets the
// same line. Results are first lines only, never serialised objects, and are
// not length-capped (the row clips visually).
const FORMATTERS = ["read", "edit", "search", "command", "code", "todos"] as const;

/**
 * Formats a call summary with a named built-in formatter.
 *
 * Use for presentation summaries declared as `@read`, `@edit`, `@search`, `@command`, `@code` or `@todos`; an unknown name returns ok:false so callers can fall back.
 * @param opts.formatter Formatter name, with or without the leading `@`.
 * @param opts.args Call arguments; omitted only checks that the formatter exists.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Formatter name, with or without the leading `@`. */
        formatter: string;
        /** Call arguments; omitted only checks that the formatter exists. */
        args?: Record<string, unknown>;
    },
): { ok: true; text: string } | { ok: false; error: string } {
    const name = String(opts.formatter ?? "").replace(/^@/, "");
    if (!(FORMATTERS as readonly string[]).includes(name)) return { ok: false, error: `unknown formatter "@${name}"` };
    const a = opts.args && typeof opts.args === "object" ? opts.args : {};
    const str = (v: unknown) => typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
    const firstLine = (v: unknown) => str(v).split(/\r?\n/).map(l => l.trim()).find(Boolean) ?? "";
    switch (name) {
        case "read": {
            const start = a.startLine, end = a.endLine, max = a.maxLines;
            const range = start || end || max ? ` :${str(start) || "1"}${end ? `-${str(end)}` : max ? `+${str(max)}` : ""}` : "";
            return { ok: true, text: `${str(a.path)}${range}${a.hashline === true ? " #" : ""}`.trim() };
        }
        case "edit": {
            const n = Array.isArray(a.edits) ? a.edits.length : 0;
            return { ok: true, text: `${str(a.path)}${n ? ` · ${n} ${n === 1 ? "edit" : "edits"}` : ""}`.trim() };
        }
        case "search": {
            const queries = Array.isArray(a.queries) ? a.queries.map(firstLine).filter(Boolean) : [];
            const what = queries.length ? queries.join(", ") : firstLine(a.pattern) || firstLine(a.query);
            const where = str(a.path) ? ` in ${str(a.path)}` : "";
            const glob = str(a.glob) ? ` (${str(a.glob)})` : "";
            return { ok: true, text: `${what}${where}${glob}`.trim() };
        }
        case "command": return { ok: true, text: firstLine(a.description) || firstLine(a.command) };
        case "code": return { ok: true, text: firstLine(a.description) || firstLine(a.code) };
        case "todos": {
            const n = Array.isArray(a.tasks) ? a.tasks.length : 0;
            return { ok: true, text: firstLine(a.title) || (n ? `${n} ${n === 1 ? "task" : "tasks"}` : "") };
        }
    }
    return { ok: false, error: `unknown formatter "@${name}"` };
}
