/** codex provider metadata and dynamically dispatched operation adapters. */
export default {
    id: "codex",
    label: "Codex",
    description: "ChatGPT subscription through the Codex backend. Log in with a device code; login and all requests use the selected transport.",
    icon: "Bot",
    inference: { priceVendor: "openai" },
    fields: [
        { key: "clientVersion", label: "Client version", type: "text", help: "Optional Codex client version sent to the backend; defaults to the detected CLI version when enabled, otherwise the documented SDK version." },
        { key: "detectCliVersion", label: "Detect CLI version", type: "boolean", default: false, help: "Use the local codex --version result instead of the SDK default. Cannot be combined with an override." },
    ],
    transports: ["direct", "socks", "ssh-tunnel"],
    validate(ctx, config) { return ctx.fns.models.provider.codex.codexValidate({ config }); },
    async clientVersion(ctx, conn, opts) { return ctx.fns.models.provider.codex.codexClientVersion({ config: conn.config, refresh: opts.refresh }); },
    async test(ctx, conn) { return ctx.fns.models.provider.codex.codexTest({ conn }); },
    async listModels(ctx, conn) { return ctx.fns.models.provider.codex.codexListModels({ conn }); },
    async usage(ctx, conn) { return ctx.fns.models.provider.codex.codexUsage({ conn }); },
    capabilities: { continuationState: true, checkpoints: true, reasoning: true, structuredOutput: true },
    reasoningProfile: (ctx, model) => ctx.fns.models.provider.codex.codexReasoningProfile({ model }),
    async stream(ctx, conn, req) { return ctx.fns.models.provider.codex.codexStream({ conn, req }); },
    async compact(ctx, conn, req) { return ctx.fns.models.provider.codex.codexCompact({ conn, req }); },
    actions: {
        login: { label: "Log in", run: async (ctx, conn) => ctx.fns.models.provider.codex.codexLoginStart({ conn }) },
        loginStatus: {
            label: "Login status",
            run: async (ctx, conn) => ctx.fns.models.provider.codex.codexLoginStatus({ conn }),
        },
        cancelLogin: { label: "Cancel login", run: async (ctx, conn) => ctx.fns.models.provider.codex.codexCancelLogin({ conn }) },
        logout: {
            label: "Log out",
            run: async (ctx, conn) => ctx.fns.models.provider.codex.codexLogout({ conn }),
        },
    },
} satisfies types.models.ProviderDefinition;
