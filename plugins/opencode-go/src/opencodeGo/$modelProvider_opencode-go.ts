/** OpenCode Go provider metadata and dynamically dispatched operation adapters. */
export default {
    id: "opencode-go",
    label: "OpenCode Go",
    description: "OpenCode Go subscription: open and proprietary coding models through one Console API key, each on its native API.",
    icon: "brand:opencode",
    inference: { priceVendor: "opencode-go" },
    fields: [
        { key: "apiKey", label: "API key", type: "secret", required: true, help: "Console API key (oc_sk_…) with Models › Request permission." },
    ],
    transports: ["direct", "socks", "ssh-tunnel"],
    async test(ctx, conn) { return ctx.fns.opencodeGo.test({ conn }); },
    async listModels(ctx, conn) { return ctx.fns.opencodeGo.listModels({ conn }); },
    async usage(ctx, conn) { return ctx.fns.opencodeGo.usage({ conn }); },
    capabilities: { reasoning: true, sampling: true, structuredOutput: true },
    async route(ctx, conn, req) { return ctx.fns.opencodeGo.route({ conn, model: req.model, info: req.info, sessionId: req.sessionId }); },
} satisfies types.models.ProviderDefinition;
