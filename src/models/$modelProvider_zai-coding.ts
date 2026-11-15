/** Z.ai Coding Plan provider metadata and dynamically dispatched operation adapters. */
export default {
    id: "zai-coding",
    label: "Z.ai Coding Plan",
    description: "Z.ai Coding Plan subscription: GLM coding models over Chat Completions or Anthropic Messages, with quota windows.",
    icon: "brand:zai",
    inference: { priceVendor: "zai", catalog: { modelsDev: ["zai-coding-plan", "zai"], piAi: ["zai"] } },
    fields: [
        { key: "apiKey", label: "API key", type: "secret", required: true, help: "Coding Plan API key from the Z.ai subscription page. It is sent only to api.z.ai." },
        { key: "protocol", label: "Protocol", type: "select", required: true, default: "openai-chat", options: [
            { value: "openai-chat", label: "OpenAI Chat Completions (Coding Plan endpoint)" },
            { value: "anthropic", label: "Anthropic Messages" },
        ], help: "Both speak to the same Coding Plan key. Chat Completions advertises GLM-5.3 reasoning levels and the explicit thinking switch; Anthropic Messages uses its native thinking protocol." },
    ],
    transports: ["direct", "socks", "ssh-tunnel"],
    async test(ctx, conn) { return ctx.fns.models.provider.zaiCoding.test({ conn }); },
    async listModels(ctx, conn) { return ctx.fns.models.provider.zaiCoding.listModels({ conn }); },
    async usage(ctx, conn) { return ctx.fns.models.provider.zaiCoding.usage({ conn }); },
    capabilities: { reasoning: true, sampling: true, structuredOutput: true },
    async route(ctx, conn, req) { return ctx.fns.models.provider.zaiCoding.route({ conn, model: req.model, info: req.info, sessionId: req.sessionId, ...(req.reasoning ? { reasoning: req.reasoning } : {}) }); },
} satisfies types.models.ProviderDefinition;
