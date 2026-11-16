/** Qwen subscription provider metadata and dynamically dispatched operation adapters. */
export default {
    id: "qwen",
    label: "Qwen Subscription",
    description: "Qwen subscription (chat.qwen.ai member plan for Qwen Code). No key: create the connection, press Log in, open the chat.qwen.ai link and approve the code. Login and all requests use the selected transport; models stream over OpenAI Chat Completions at api.qwen.ai. Uses Qwen Code's unofficial subscription endpoints and public client id, which Qwen may change or restrict; check Qwen's terms for third-party use. No usage endpoint: the card shows the plan, and a weekly-credits bar only after Qwen reports the credits are used up.",
    icon: "brand:qwen",
    inference: { catalog: { modelsDev: ["alibaba"] } },
    fields: [],
    transports: ["direct", "socks", "ssh-tunnel"],
    async test(ctx, conn) { return ctx.fns.models.provider.qwen.test({ conn }); },
    async listModels(ctx, conn) { return ctx.fns.models.provider.qwen.listModels({ conn }); },
    async usage(ctx, conn) { return ctx.fns.models.provider.qwen.usage({ conn }); },
    // No network: usage reads the stored plan and the process-local quota record.
    usageRefreshMs: 10000,
    capabilities: { structuredOutput: true },
    async route(ctx, conn, req) { return ctx.fns.models.provider.qwen.route({ conn, model: req.model }); },
    classifyFailure: (ctx, conn, input) => ctx.fns.models.provider.qwen.failure({ conn, status: input.status, body: input.body }),
    actions: {
        login: { label: "Log in", run: async (ctx, conn) => ctx.fns.models.provider.qwen.login({ conn, op: "start" }) },
        loginStatus: { label: "Login status", run: async (ctx, conn) => ctx.fns.models.provider.qwen.loginStatus({ conn }) },
        cancelLogin: { label: "Cancel login", run: async (ctx, conn) => ctx.fns.models.provider.qwen.login({ conn, op: "cancel" }) },
        logout: { label: "Log out", run: async (ctx, conn) => ctx.fns.models.provider.qwen.logout({ conn }) },
    },
} satisfies types.models.ProviderDefinition;
