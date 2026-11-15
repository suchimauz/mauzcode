/** custom provider metadata and dynamically dispatched operation adapters. */
export default {
    id: "custom",
    label: "Custom",
    icon: "Plug",
    description: "Connect an OpenAI, Anthropic or Gemini compatible API endpoint.",
    fields: [
        { key: "baseUrl", label: "API base URL", type: "url", required: true },
        { key: "apiKey", label: "API key", type: "secret" },
        { key: "protocol", label: "Protocol", type: "select", required: true, default: "openai-chat", options: [
            { value: "openai-chat", label: "OpenAI Chat Completions" },
            { value: "openai-responses", label: "OpenAI Responses" },
            { value: "anthropic", label: "Anthropic Messages" },
            { value: "gemini", label: "Gemini" },
        ] },
        { key: "testModel", label: "Test model", type: "text", help: "Optional model for a minimal generation test, which may incur a charge. Manual model ids are configured through the shared models list." },
        { key: "sessionAffinity", label: "Send x-session-affinity header", type: "boolean", default: true, help: "Sends an x-session-affinity header with a stable, opaque per-conversation identifier on inference requests so the endpoint can keep a conversation on one backend and its prompt cache warm. It reveals no agent id but lets the endpoint group requests of one conversation. Turn off to stop sending it." },
    ],
    transports: ["direct", "socks", "ssh-tunnel"],
    validate(ctx, config) { return ctx.fns.models.provider.custom.customValidate({ config }); },
    async test(ctx, conn) { return ctx.fns.models.provider.custom.customTest({ conn }); },
    async listModels(ctx, conn) { return ctx.fns.models.provider.custom.customListModels({ conn }); },
    capabilities: { sampling: true, structuredOutput: true },
    async stream(ctx, conn, req) { return ctx.fns.models.provider.custom.customStream({ conn, req }); },
    // No usage callback: the core returns only test status, reason and checkedAt.
} satisfies types.models.ProviderDefinition;
