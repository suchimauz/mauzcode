// The single presentation resolver for a tool call: label, icon, category and
// one-line summary, from the tool's own declaration.
//
// Every chat surface (finished rows, running rows, mobile modals, work-group
// headers) reads these values, so one call cannot look different running and
// finished. Computed at read time — stored transcript events are never
// rewritten, and an undeclared or historical name gets the wrench and its raw
// name rather than an error.
//
// No length cap: a summary is a first line, so its size is bounded by the
// argument itself; the client clips visually with the full text as a tooltip.
const HIDDEN = new Set(["html", "secrets", "env"]);

/**
 * Resolves how one tool call is presented in chat: label, icon, category and summary.
 *
 * Use for every surface that shows a call — events routes, the running-call registry, detail views — so all agree; optionally returns the call's arguments with secret-bearing values redacted.
 * @param opts.name Call name as recorded: wire name, dotted name or alias such as `tools_eval`.
 * @param opts.args Call arguments; non-objects are treated as no arguments.
 * @param opts.redactArgs Also return `args` with `secrets`, `env` and `x-secret` properties redacted.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Call name as recorded: wire name, dotted name or alias such as `tools_eval`. */
        name: string;
        /** Call arguments; non-objects are treated as no arguments. */
        args?: unknown;
        /** Also return `args` with `secrets`, `env` and `x-secret` properties redacted. */
        redactArgs?: boolean;
    },
): { label: string; icon: string; category: string; summary: string; args?: any } {
    const name = String(opts.name || "tool");
    const args: Record<string, unknown> = opts.args && typeof opts.args === "object" && !Array.isArray(opts.args) ? opts.args as Record<string, unknown> : {};
    const tool = ctx.fns.tools.declaration({ name });
    const declared = tool?.presentation ? ctx.fns.tools.normalizePresentation({ presentation: tool.presentation }).presentation : null;
    const schemaProps = tool?.parameters?.properties ?? {};

    let summary: string | null = null;
    if (declared?.summary) {
        const r = declared.summary.startsWith("@")
            ? ctx.fns.tools.summaryFormat({ formatter: declared.summary, args })
            : ctx.fns.tools.summaryTemplate({ template: declared.summary, args });
        if (r.ok) summary = r.text;
    }
    if (summary === null) summary = fallback(args, schemaProps);

    const out: { label: string; icon: string; category: string; summary: string; args?: any } = {
        label: declared?.label ?? name,
        icon: declared?.icon ?? "wrench",
        category: declared?.category ?? "tools",
        summary,
    };
    if (opts.redactArgs) out.args = ctx.fns.tools.redactArgs({ args: opts.args ?? {}, parameters: tool?.parameters });
    return out;
}

// First line of the first non-empty string argument that is not presentation
// noise (html) or secret-bearing; never a serialised object.
function fallback(args: Record<string, unknown>, props: Record<string, any>): string {
    for (const [key, value] of Object.entries(args)) {
        if (HIDDEN.has(key) || props[key]?.["x-secret"] === true || typeof value !== "string") continue;
        const line = value.split(/\r?\n/).map(l => l.trim()).find(Boolean);
        if (line) return line;
    }
    return "";
}
