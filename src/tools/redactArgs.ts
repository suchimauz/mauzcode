// Hide secret-bearing arguments before a call leaves the server.
//
// `secrets` (even references such as op:// or secret:// — a reference reveals
// vault structure and is not needed to understand a call), `env`, and every
// property the tool's schema marks `x-secret: true` are replaced, at any depth
// the schema describes. Objects become "••• (N keys)", everything else "•••".
// The stored transcript is untouched; this is applied on every way out.
const ALWAYS = new Set(["secrets", "env"]);

/**
 * Returns a copy of tool-call arguments with secret-bearing values redacted.
 *
 * Use before broadcasting or returning call arguments to clients: redacts `secrets`, `env` and schema properties marked `x-secret: true`; non-object arguments are returned unchanged.
 * @param opts.args Call arguments as stored or received.
 * @param opts.parameters JSON Schema of the tool's arguments, used to find `x-secret` properties; omitted redacts only the fixed keys.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Call arguments as stored or received. */
        args: unknown;
        /** JSON Schema of the tool's arguments, used to find `x-secret` properties; omitted redacts only the fixed keys. */
        parameters?: any;
    },
): any {
    return redact(opts.args, opts.parameters, true);
}

function mask(value: unknown): string {
    if (value && typeof value === "object") {
        const n = Array.isArray(value) ? value.length : Object.keys(value).length;
        return `••• (${n} ${n === 1 ? "key" : "keys"})`;
    }
    return "•••";
}

function redact(value: unknown, schema: any, top: boolean): unknown {
    if (Array.isArray(value)) return value.map(item => redact(item, schema?.items, false));
    if (!value || typeof value !== "object") return value;
    const props = schema && typeof schema === "object" && schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        const prop = props[key];
        if ((top && ALWAYS.has(key)) || prop?.["x-secret"] === true) out[key] = mask(item);
        else out[key] = redact(item, prop, false);
    }
    return out;
}
