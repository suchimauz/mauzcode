/**
 * List every model an agent may choose, with the reasoning levels it supports
 *
 * Use to answer "which model routes can I delegate to?" without secrets and without a provider request: reads only stored connections, the global provider switch and each connection's cached or manual catalogue (models.listModels with cacheOnly). A route is included only when its provider is not globally disabled, its connection is enabled and the owner has not disabled the model on that connection. Routes use the exact `provider/accountName:modelId` grammar every delegating entry point (`agent.delegate`, `session.fork`, `sharedAgent.delegate`) accepts; `models.selectable` never validates a choice, it only enumerates the current ones. An empty catalogue yields no rows for that connection. Returns at most `limit` rows (default 200) in stable provider, account then model order.
 * @param opts.provider Only routes of this provider id.
 * @param opts.limit Maximum rows to return. @default 200
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Only routes of this provider id. */
        provider?: string;
        /** Maximum rows to return; every other filter still applies first. @default 200 */
        limit?: number;
    } = {},
): Promise<{ models: Array<{ route: string; label: string; reasoning: types.models.ReasoningLevel[] }>; total: number }> {
    const limit = Math.max(1, Math.min(1000, Math.floor(Number(opts.limit) || 200)));
    const disabled = await ctx.fns.models.disabledProviders({});
    const connections = await ctx.fns.models.connections.list(opts.provider === undefined ? {} : { provider: String(opts.provider) });
    const models: Array<{ route: string; label: string; reasoning: types.models.ReasoningLevel[] }> = [];
    let total = 0;
    for (const view of connections) {
        // Enabled connections of enabled providers only; a cold cache yields no rows rather than a network call.
        if (!view.enabled || disabled.has(view.provider)) continue;
        const { models: catalogue } = await ctx.fns.models.catalog.listModels({ id: view.id, cacheOnly: true });
        const off = new Set(view.disabledModels);
        for (const model of catalogue) {
            // Includes a group whose every variant member is disabled.
            if (off.has(model.id) || model.disabled) continue;
            total++;
            if (models.length >= limit) continue;
            models.push({
                route: `${view.provider}/${view.accountName}:${model.id}`,
                label: model.label?.trim() || model.id,
                reasoning: model.reasoning?.supported ?? [],
            });
        }
    }
    return { models, total };
}
