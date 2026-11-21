/** Gemini (Google account) provider metadata and dynamically dispatched operation adapters. */
export default {
    id: "gemini",
    label: "Gemini (Google account)",
    description: "Gemini through a Google account, like Gemini CLI: no key — create the connection, press Log in, approve access in the browser and paste the shown code. Login and all requests use the selected transport; models stream over Google's Code Assist API (cloudcode-pa.googleapis.com) with automatic free-tier onboarding. Warning: this uses an unofficial Google API with Gemini CLI's client identity; Google may limit, suspend or block an account used this way. Use a separate, non-critical Google account and check Google's terms.",
    icon: "brand:gemini",
    inference: { catalog: { modelsDev: ["google"] } },
    fields: [],
    transports: ["direct", "socks", "ssh-tunnel"],
    async test(ctx, conn) { return ctx.fns.models.provider.gemini.test({ conn }); },
    async listModels(ctx) { return ctx.fns.models.provider.gemini.listModels({}); },
    async usage(ctx, conn) { return ctx.fns.models.provider.gemini.usage({ conn }); },
    usageRefreshMs: 60000,
    capabilities: { reasoning: true, sampling: true, structuredOutput: true },
    reasoningProfile: (ctx, model) => ctx.fns.models.provider.gemini.reasoningProfile({ model }),
    async stream(ctx, conn, req) { return ctx.fns.models.provider.gemini.stream({ conn, req }); },
    classifyFailure: (ctx, conn, input) => ctx.fns.models.provider.gemini.failure({ conn, status: input.status, body: input.body, model: input.model }),
    async countTokens(ctx, conn, req) {
        return ctx.fns.models.provider.gemini.countTokens({ conn, model: req.model, messages: req.messages, ...(req.instructions !== undefined ? { instructions: req.instructions } : {}) });
    },
    actions: {
        login: { label: "Log in", run: async (ctx, conn) => ctx.fns.models.provider.gemini.login({ conn, op: "start" }) },
        loginStatus: { label: "Login status", run: async (ctx, conn) => ctx.fns.models.provider.gemini.loginStatus({ conn }) },
        submitLogin: { label: "Submit authorization code", run: async (ctx, conn, input) => ctx.fns.models.provider.gemini.submitLogin({ conn, input }) },
        cancelLogin: { label: "Cancel login", run: async (ctx, conn) => ctx.fns.models.provider.gemini.login({ conn, op: "cancel" }) },
        logout: { label: "Log out", run: async (ctx, conn) => ctx.fns.models.provider.gemini.logout({ conn }) },
    },
} satisfies types.models.ProviderDefinition;
