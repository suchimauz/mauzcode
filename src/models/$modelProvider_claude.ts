/** claude provider metadata and dynamically dispatched operation adapters. */
export default {
    id: "claude", label: "Claude", description: "Claude subscription with owner-managed OAuth login", icon: "sparkles",
    inference: { systemPreamble: "You are Claude Code, Anthropic's official CLI for Claude.", priceVendor: "anthropic" },
    fields: [{ key: "clientVersion", label: "Client version", type: "text", required: false }],
    transports: ["direct", "socks", "ssh-tunnel"],
    validate(ctx, config) { return ctx.fns.models.provider.claude.claudeValidate({ config }); },
    async test(ctx, conn) { return ctx.fns.models.provider.claude.claudeTest({ conn }); },
    async listModels(ctx) { return ctx.fns.models.provider.claude.claudeListModels({  }); },
    async usage(ctx, conn) { return ctx.fns.models.provider.claude.claudeUsage({ conn }); },
    capabilities: { sampling: true },
    async stream(ctx, conn, req) { return ctx.fns.models.provider.claude.claudeStream({ conn, req }); },
    async compact(ctx, conn, req) { return ctx.fns.models.provider.claude.claudeCompact({ conn, req }); },
    actions: {
        login: { label: "Log in", run: async (ctx, conn) => ctx.fns.models.provider.claude.claudeLoginStart({ conn }) },
        loginStatus: { label: "Login status", run: async (ctx, conn) => ctx.fns.models.provider.claude.claudeLoginStatus({ conn }) },
        submitLogin: { label: "Submit authorization code", run: async (ctx, conn, input) => ctx.fns.models.provider.claude.claudeSubmitLogin({ conn, input }) },
        cancelLogin: { label: "Cancel login", run: async (ctx, conn) => ctx.fns.models.provider.claude.claudeCancelLogin({ conn }) },
        logout: { label: "Log out", run: async (ctx, conn) => ctx.fns.models.provider.claude.claudeLogout({ conn }) },
    },
} satisfies types.models.ProviderDefinition;
