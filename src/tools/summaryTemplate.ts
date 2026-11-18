// Render a presentation summary template over a call's arguments.
//
// Grammar (the whole language — anything richer is a named formatter):
//   {key}            a top-level argument; strings, numbers and booleans render,
//                    objects and arrays never do (no serialised blobs in a row)
//   {key|filter}     exactly one filter: first-line, count, basename
//   [ ... ]          optional segment, rendered only when every placeholder in
//                    it is non-empty; segments do not nest
//   a || b           top-level alternatives (outside braces and brackets): the
//                    first whose required placeholders are all non-empty wins
//
// A malformed template is reported, never thrown: the loader turns it into a
// warning and the resolver into the safe fallback summary.
type Part = { kind: "text"; text: string } | { kind: "slot"; key: string; filter?: string } | { kind: "optional"; parts: Part[] };

const FILTERS = new Set(["first-line", "count", "basename"]);

/**
 * Parses and renders a tool presentation summary template over call arguments.
 *
 * Use to validate a declared template (omit args) or to produce the summary of one call; a malformed template returns ok:false with an error instead of throwing.
 * @param opts.template Template text such as `{path}[ · {status}]` or `{note|first-line} || {id}`.
 * @param opts.args Call arguments; omitted only validates the template.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Template text such as `{path}[ · {status}]` or `{note|first-line} || {id}`. */
        template: string;
        /** Call arguments; omitted only validates the template. */
        args?: Record<string, unknown>;
    },
): { ok: true; text: string } | { ok: false; error: string } {
    let alternatives: Part[][];
    try {
        alternatives = splitAlternatives(String(opts.template ?? "")).map(parseAlternative);
    } catch (error: any) {
        return { ok: false, error: String(error?.message ?? error) };
    }
    const args = opts.args && typeof opts.args === "object" ? opts.args : {};
    for (const parts of alternatives) {
        const required = parts.filter((p): p is Extract<Part, { kind: "slot" }> => p.kind === "slot");
        if (required.some(slot => !value(args, slot))) continue;
        return { ok: true, text: parts.map(part => render(args, part)).join("") };
    }
    return { ok: true, text: "" };
}

function splitAlternatives(template: string): string[] {
    const out: string[] = [];
    let depthBrace = 0, depthBracket = 0, start = 0;
    for (let i = 0; i < template.length; i++) {
        const c = template[i];
        if (c === "{") depthBrace++;
        else if (c === "}") depthBrace--;
        else if (c === "[") depthBracket++;
        else if (c === "]") depthBracket--;
        else if (depthBrace === 0 && depthBracket === 0 && template.startsWith(" || ", i)) {
            out.push(template.slice(start, i));
            start = i + 4;
            i += 3;
        }
    }
    out.push(template.slice(start));
    return out;
}

function parseAlternative(text: string): Part[] {
    const parts: Part[] = [];
    let i = 0;
    let literal = "";
    let optional: Part[] | null = null;
    const target = () => optional ?? parts;
    const flush = () => { if (literal) target().push({ kind: "text", text: literal }); literal = ""; };
    while (i < text.length) {
        const c = text[i]!;
        if (c === "{") {
            const end = text.indexOf("}", i + 1);
            if (end < 0) throw new Error(`unclosed "{" at ${i}`);
            const body = text.slice(i + 1, end);
            if (/[{}\[\]]/.test(body)) throw new Error(`invalid placeholder "{${body}}"`);
            const [key, filter, extra] = body.split("|").map(s => s.trim());
            if (extra !== undefined) throw new Error(`placeholder "{${body}}" has more than one filter`);
            if (!key || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) throw new Error(`invalid placeholder key in "{${body}}"`);
            if (filter !== undefined && !FILTERS.has(filter)) throw new Error(`unknown filter "${filter}"`);
            flush();
            target().push(filter ? { kind: "slot", key, filter } : { kind: "slot", key });
            i = end + 1;
        } else if (c === "[") {
            if (optional) throw new Error(`nested "[" at ${i}`);
            flush();
            optional = [];
            i++;
        } else if (c === "]") {
            if (!optional) throw new Error(`unmatched "]" at ${i}`);
            flush();
            parts.push({ kind: "optional", parts: optional });
            optional = null;
            i++;
        } else if (c === "}") {
            throw new Error(`unmatched "}" at ${i}`);
        } else {
            literal += c;
            i++;
        }
    }
    if (optional) throw new Error(`unclosed "["`);
    flush();
    return parts;
}

function render(args: Record<string, unknown>, part: Part): string {
    if (part.kind === "text") return part.text;
    if (part.kind === "slot") return value(args, part);
    const slots = part.parts.filter((p): p is Extract<Part, { kind: "slot" }> => p.kind === "slot");
    if (slots.some(slot => !value(args, slot))) return "";
    return part.parts.map(p => render(args, p)).join("");
}

function value(args: Record<string, unknown>, slot: { key: string; filter?: string }): string {
    const raw = args[slot.key];
    if (slot.filter === "count") {
        const n = Array.isArray(raw) ? raw.length : raw && typeof raw === "object" ? Object.keys(raw).length : 0;
        return n > 0 ? String(n) : "";
    }
    if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") return "";
    const text = String(raw);
    if (slot.filter === "first-line") return text.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? "";
    if (slot.filter === "basename") return text.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
    return text.trim() ? text : "";
}
