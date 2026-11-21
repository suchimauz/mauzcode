/**
 * Build a Gemini generateContent request body from a neutral streaming request
 *
 * Shared by the public gemini protocol and the Code Assist provider. Converts the transcript (system rows dropped) with toGeminiContents and returns `{ contents, systemInstruction?, tools?, generationConfig? }`: temperature, maxOutputTokens from maxTokens, responseMimeType application/json and responseSchema for a json_schema response format. Unless `omitReasoning` is set, SDK-resolved low/medium/high reasoning becomes generationConfig.thinkingConfig.thinkingLevel (the wire value when given); other levels send nothing. Pure apart from the conversion; sends nothing.
 * @param opts.request Streaming request without checkpoint entries.
 * @param opts.omitReasoning Skip the shared thinkingLevel mapping so the caller can build thinkingConfig itself. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Streaming request without checkpoint entries. */
        request: types.models.StreamRequest;
        /** Skip the shared thinkingLevel mapping so the caller can build thinkingConfig itself. @default false */
        omitReasoning?: boolean;
    },
): Promise<{ contents: Array<{ role: string; parts: Array<Record<string, any>> }>; systemInstruction?: { parts: { text: string }[] }; tools?: Record<string, unknown>[]; generationConfig?: Record<string, unknown> }> {
    const req = opts.request;
    const transcript = (req.messages as Record<string, any>[]).filter(m => m.role !== "system");
    const contents = await ctx.fns.models.protocol.gemini.toGeminiContents({ messages: transcript });
    const format = req.responseFormat;
    const generationConfig: Record<string, unknown> = {
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
        ...(format ? { responseMimeType: "application/json" } : {}),
        ...(format?.type === "json_schema" ? { responseSchema: format.schema } : {}),
        // Gemini thinking levels are sent only for exact low/medium/high SDK levels; auto and others send nothing.
        ...(!opts.omitReasoning && req.reasoning && ["low", "medium", "high"].includes(req.reasoning.applied) ? { thinkingConfig: { thinkingLevel: req.reasoning.wire ?? req.reasoning.applied } } : {}),
    };
    return {
        contents,
        ...(req.instructions ? { systemInstruction: { parts: [{ text: req.instructions }] } } : {}),
        ...(req.tools?.length ? { tools: ctx.fns.models.protocol.gemini.toTools({ tools: req.tools }) } : {}),
        ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
    };
}
