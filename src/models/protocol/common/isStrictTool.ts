/**
 * Check whether a JSON Schema permits OpenAI strict tool decoding
 *
 * Use before emitting either OpenAI tool shape. Every nested object must forbid additional properties and require all properties; descend through arrays and schema combinators without modifying the schema.
 * @param opts.schema JSON Schema to inspect recursively for optional properties.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** JSON Schema to inspect recursively for optional properties. */
        schema: Record<string, unknown> | boolean;
    },
): boolean {
    const visit = (schema: unknown): boolean => {
     if (!schema || typeof schema !== 'object') return true;
     const s = schema as Record<string, unknown>;
     const types = Array.isArray(s.type) ? s.type : [s.type];
     if (types.includes('object') || s.properties !== undefined) {
      if (s.additionalProperties !== false) return false;
      const props = s.properties && typeof s.properties === 'object' ? s.properties as Record<string, unknown> : {};
      const required = Array.isArray(s.required) ? s.required : [];
      if (!Object.keys(props).every(key => required.includes(key)) || !Object.values(props).every(visit)) return false;
     }
     if (s.items !== undefined && !(Array.isArray(s.items) ? s.items.every(visit) : visit(s.items))) return false;
     for (const key of ['anyOf','oneOf','allOf','prefixItems']) if (Array.isArray(s[key]) && !(s[key] as unknown[]).every(visit)) return false;
     for (const key of ['$defs','definitions','patternProperties']) if (s[key] && typeof s[key] === 'object' && !Object.values(s[key] as object).every(visit)) return false;
     for (const key of ['not','if','then','else','contains']) if (s[key] !== undefined && !visit(s[key])) return false;
     return true;
    };
    return visit(opts.schema);
}
