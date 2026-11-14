/**
 * Build the structured-output fallback instruction or normalize a structured answer
 *
 * Single structured-output contract of models.call. action "instruction" returns the JSON-only text appended to the instructions for providers without capabilities.structuredOutput (including the schema for json_schema). action "normalize" strips surrounding Markdown code fences, parses JSON and, for json_schema, checks the top-level object type, required properties and additionalProperties:false; it returns compact JSON or throws INVALID_OUTPUT (retryable:false) without echoing the response text.
 * @param opts.action Which step to run: instruction or normalize.
 * @param opts.format Requested structured output format.
 * @param opts.text Provider answer to normalize; required for action normalize.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Which step to run: instruction or normalize. */
        action: "instruction" | "normalize";
        /** Requested structured output format. */
        format: types.models.ResponseFormat;
        /** Provider answer to normalize; required for action normalize. */
        text?: string;
    },
): string {
    const { format } = opts;
    if (opts.action === "instruction") {
        const base = "Respond with only one valid JSON value and no other text, explanation or Markdown.";
        return format.type === "json_schema" ? base + " The JSON must match this JSON Schema:\n" + JSON.stringify(format.schema) : base;
    }
    const invalid = (message: string) => ctx.fns.models.inference.failure({ message, status: 502, info: { code: "INVALID_OUTPUT", classification: "provider", acceptance: "accepted", retryable: false, replaySafe: false } });
    const cleaned = String(opts.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    let value: unknown;
    try { value = JSON.parse(cleaned); } catch { throw invalid("Provider returned invalid structured JSON"); }
    if (format.type === "json_schema") {
        const schema = format.schema as { type?: unknown; required?: unknown; properties?: unknown; additionalProperties?: unknown };
        const isObject = !!value && typeof value === "object" && !Array.isArray(value);
        if (schema.type === "object" && !isObject) throw invalid("Structured response is not an object");
        if (isObject) {
            const obj = value as Record<string, unknown>;
            for (const key of Array.isArray(schema.required) ? schema.required : []) if (!Object.hasOwn(obj, String(key))) throw invalid("Structured response is missing a required property");
            const props = schema.properties && typeof schema.properties === "object" ? schema.properties as Record<string, unknown> : {};
            if (schema.additionalProperties === false) for (const key of Object.keys(obj)) if (!Object.hasOwn(props, key)) throw invalid("Structured response has an unknown property");
        }
    }
    return JSON.stringify(value);
}
