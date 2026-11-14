/**
 * Generate multilingual retrieval text for runtime functions or plugins through a model route
 *
 * Use from docs and plugin indexing. Resolves the model route (opts.model, else runtime.localizationModel) through models.resolveRoute and calls models.call with a strict JSON schema, five records at a time with one retry each. A route that does not resolve fails the whole call without trying another model; individual invalid answers are listed in failed.
 * @param opts.functions Function or plugin records with stable names and canonical retrieval text.
 * @param opts.locales BCP-47-like target locale codes.
 * @param opts.model Exact provider/accountName:modelId route; empty uses runtime.localizationModel.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Function or plugin records with stable names and canonical retrieval text. */
        functions: Array<{ name: string; text: string }>;
        /** BCP-47-like target locale codes. */
        locales: string[];
        /** Exact provider/accountName:modelId route; empty uses runtime.localizationModel. */
        model?: string;
    },
): Promise<{ provider: string; model: string; localized: Record<string, string>; failed: string[] }> {
    const model = String(opts.model ?? "").trim() || await ctx.fns.runtime.localizationModel({});
    const provider = model.slice(0, Math.max(0, model.indexOf("/")));
    if (!opts.functions.length || !opts.locales.length) return { provider, model, localized: {}, failed: [] };
    const resolved = await ctx.fns.models.resolveRoute({ route: model });
    const schema = { type: "object", additionalProperties: false, required: ["name", "text"], properties: { name: { type: "string" }, text: { type: "string" } } };
    const system = "Return one JSON object with exactly two keys: name and text. Create multilingual retrieval text for one runtime capability. Preserve the exact name. The text value must exceed 120 characters. For every requested locale write a precise capability description, synonyms, grammatical forms, colloquial wording, and 8 natural user requests this exact capability can satisfy. Include broad intent and parameter-specific requests. Name the general subject area the capability belongs to using the plain everyday word for it, not only the vendor or product name, because people ask by subject: mail for a Gmail capability, calendar for a scheduling one, chat or messages for a messenger one. Describe only the source capability; never invent adjacent behavior. Do not use markdown fences.";
    const one = async (item: { name: string; text: string }) => {
        const call = await ctx.fns.models.call({ connectionId: resolved.connectionId, model: resolved.model, system, temperature: 0, maxTokens: 3000,
            responseFormat: { type: "json_schema", name: "localized_retrieval_text", strict: true, schema },
            user: JSON.stringify({ locales: opts.locales, capability: { name: item.name, source: item.text.slice(0, 6000) } }),
            sessionId: "localize-" + Bun.hash(item.name).toString(16) });
        let body: { name?: unknown; text?: unknown };
        try { body = JSON.parse(String(call.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { throw new Error("localization returned invalid JSON for " + item.name); }
        const text = String(body?.text ?? "").trim();
        if (body?.name !== item.name || text.length < 120) throw new Error("localization returned invalid content for " + item.name);
        return { name: item.name, text: text.slice(0, 8000) };
    };
    const localized: Record<string, string> = {};
    const failed: string[] = [];
    for (let offset = 0; offset < opts.functions.length; offset += 5) {
        const group = opts.functions.slice(offset, offset + 5);
        const settled = await Promise.allSettled(group.map(item => one(item).catch(() => one(item))));
        settled.forEach((row, i) => { if (row.status === "fulfilled") localized[row.value.name] = row.value.text; else failed.push(group[i]!.name); });
    }
    return { provider, model, localized, failed };
}
