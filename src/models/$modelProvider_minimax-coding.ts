/** MiniMax M Plan provider metadata and dynamically dispatched operation adapters. */
export default {
    id: "minimax-coding",
    label: "MiniMax M Plan",
    description: "MiniMax M Plan coding subscription: MiniMax-M3 family over the Anthropic-compatible gateway, with documented thinking control, thinking replay and five-hour/weekly quota windows.",
    icon: "brand:minimax",
    inference: { priceVendor: "minimax", catalog: { modelsDev: ["minimax"] } },
    fields: [
        { key: "apiKey", label: "API key", type: "secret", required: true, help: "M Plan subscription key from platform.minimax.io. It is sent only to api.minimax.io and www.minimax.io." },
        { key: "serviceTier", label: "Service tier", type: "select", default: "standard", options: [
            { value: "standard", label: "Standard" },
            { value: "priority", label: "Priority" },
        ], help: "Admission tier requested on every model except MiniMax-M3.1-Flash, which has no tier." },
    ],
    transports: ["direct", "socks", "ssh-tunnel"],
    async test(ctx, conn) { return ctx.fns.models.provider.minimaxCoding.test({ conn }); },
    async listModels(ctx, conn) { return ctx.fns.models.provider.minimaxCoding.listModels({ conn }); },
    async usage(ctx, conn) { return ctx.fns.models.provider.minimaxCoding.usage({ conn }); },
    // MiniMax ignores temperature and counts thinking inside max_tokens, so no
    // sampling capability: callers' temperature/maxTokens are reported as ignored.
    capabilities: { reasoning: true, structuredOutput: true },
    async route(ctx, conn, req) { return ctx.fns.models.provider.minimaxCoding.route({ conn, model: req.model, info: req.info, sessionId: req.sessionId, ...(req.reasoning ? { reasoning: req.reasoning } : {}) }); },
    reasoningProfile: (ctx, model) => ctx.fns.models.provider.minimaxCoding.reasoningProfile({ model }),
    classifyFailure: (ctx, conn, input) => ctx.fns.models.provider.minimaxCoding.failure({ conn, status: input.status, body: input.body, model: input.model }),
    async countTokens(ctx, conn, req) {
        return ctx.fns.models.provider.minimaxCoding.countTokens({ conn, model: req.model, messages: req.messages, ...(req.instructions !== undefined ? { instructions: req.instructions } : {}), ...(req.tools !== undefined ? { tools: req.tools } : {}) });
    },
} satisfies types.models.ProviderDefinition;
