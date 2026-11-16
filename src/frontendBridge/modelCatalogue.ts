/**
 * Build the UI model catalogue from stored model connections
 *
 * Use for every React model picker and model label projection. Lists registered connections through models.list and each catalogue through models.listModels (persistent cache; the provider is asked only when nothing is cached). Routes are provider/accountName:modelId, the group label is the connection account name and the display label comes from models.displayNames (catalogue label, then models.dev, then a prettified id). Models of disabled connections, owner-disabled models and globally disabled providers (models.disabledProviders, read once per request) are flagged disabled; groups of disabled providers are reported enabled:false, unavailable:false so pickers hide them without unavailable notices. A connection whose provider is not registered (its catalogue is not requested), whose catalogue call throws (reported with a fixed safe message, never the raw exception), or whose catalogue is empty with an error is reported as unavailable while the others are still listed. When the provider errors but cached or manual models exist, those models stay usable and the group carries the error with unavailable false (degraded). Never mutates agents or connections and never returns secrets.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{ groups: Array<{ connectionId: string; provider: string; accountName: string; enabled: boolean; unavailable: boolean; error?: string }>; models: Array<{ provider: string; model: string; label: string; groupLabel: string; connectionId: string; disabled: boolean; reasoning?: { supported: types.models.ReasoningLevel[]; default?: types.models.ReasoningLevel } }> }> {
    const connections = await ctx.fns.models.list({});
        const disabledProviders = await ctx.fns.models.disabledProviders({});
        const registered = new Set(ctx.fns.models.providers({}).map(provider => provider.id));
        const groups: Array<{ connectionId: string; provider: string; accountName: string; enabled: boolean; unavailable: boolean; error?: string }> = [];
        const models: Array<{ provider: string; model: string; label: string; groupLabel: string; connectionId: string; disabled: boolean; reasoning?: { supported: types.models.ReasoningLevel[]; default?: types.models.ReasoningLevel } }> = [];
        // One failing catalogue must not hide the other connections: report it as unavailable instead.
        const catalogues = await Promise.all(connections.map(async connection => {
            // A globally disabled provider is a disabled group, not an unavailable-catalogue notice; cache/manual only.
            if (disabledProviders.has(connection.provider)) {
                try {
                    const result = await ctx.fns.models.listModels({ id: connection.id, cacheOnly: true });
                    return { connection, list: result.models, unavailable: false, error: undefined };
                } catch { return { connection, list: [] as types.models.ModelInfo[], unavailable: false, error: undefined }; }
            }
            if (!connection.providerRegistered || !registered.has(connection.provider))
                return { connection, list: [] as types.models.ModelInfo[], unavailable: true, error: "Provider " + connection.provider + " is not registered" };
            try {
                const result = await ctx.fns.models.listModels({ id: connection.id });
                return { connection, list: result.models, unavailable: !result.models.length && !!result.error, error: result.error };
            } catch { return { connection, list: [] as types.models.ModelInfo[], unavailable: true, error: "Model list could not be loaded" }; } // Unexpected throws may carry secrets: expose a fixed message only.
        }));
        for (const entry of catalogues) {
            const { connection, list, unavailable, error } = entry;
            groups.push({ connectionId: connection.id, provider: connection.provider, accountName: connection.accountName, enabled: connection.enabled && !disabledProviders.has(connection.provider), unavailable, ...(error ? { error } : {}) });
            const off = new Set(connection.disabledModels);
            for (const info of list) models.push({
                provider: connection.provider, model: connection.provider + "/" + connection.accountName + ":" + info.id,
                label: info.label || info.id, groupLabel: connection.accountName, connectionId: connection.id,
                disabled: !connection.enabled || disabledProviders.has(connection.provider) || !!info.disabled || off.has(info.id),
                ...(info.reasoning ? { reasoning: info.reasoning } : {}),
            });
        }
        // One naming pass for the whole catalogue: provider labels first, then models.dev, then a prettified id.
        const labels = Object.fromEntries(catalogues.flatMap(({ connection, list }) => list.filter(info => info.label?.trim()).map(info => [connection.provider + "/" + connection.accountName + ":" + info.id, info.label!.trim()] as const)));
        const names = await ctx.fns.models.displayNames({ routes: models.map(m => m.model), labels }).catch(() => ({} as Record<string, string>));
        for (const m of models) m.label = names[m.model] || m.label;
        return { groups, models };
}
