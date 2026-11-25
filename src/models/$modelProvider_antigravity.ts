/** Antigravity provider metadata and dynamically dispatched operation adapters. */
export default {
    id: "antigravity",
    label: "Antigravity",
    description: "Gemini models of one Antigravity account, signed in with Google. No key: create the connection, press Log in and open the Google link; if the browser runs on another machine, paste the address it lands on. Warning: Google's Antigravity terms disallow third-party access with a personal Antigravity login and Google may suspend the account. Nothing is contacted before sign-in.",
    icon: "brand:gemini",
    fields: [],
    transports: ["direct", "socks", "ssh-tunnel"],
    async test(ctx, conn) { return ctx.fns.models.provider.antigravity.test({ conn }); },
    async listModels(ctx, conn) { return ctx.fns.models.provider.antigravity.listModels({ conn }); },
    capabilities: { reasoning: true, sampling: true, structuredOutput: true },
    reasoningProfile: (ctx, model) => ctx.fns.models.provider.antigravity.reasoningProfile({ model }),
    async stream(ctx, conn, req) { return ctx.fns.models.provider.antigravity.stream({ conn, req }); },
    actions: {
        login: { label: "Log in", run: async (ctx, conn) => ctx.fns.models.provider.antigravity.loginStart({ conn }) },
        loginStatus: { label: "Login status", run: async (ctx, conn) => ctx.fns.models.provider.antigravity.loginStatus({ conn }) },
        submitLogin: { label: "Submit redirect address", run: async (ctx, conn, input) => ctx.fns.models.provider.antigravity.submitLogin({ conn, input }) },
        cancelLogin: { label: "Cancel login", run: async (ctx, conn) => ctx.fns.models.provider.antigravity.cancelLogin({ conn }) },
        logout: { label: "Log out", run: async (ctx, conn) => ctx.fns.models.provider.antigravity.logout({ conn }) },
    },
} satisfies types.models.ProviderDefinition;
