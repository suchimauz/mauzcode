/**
 * Chooses the model route for a caller that names no model; there is no default-model setting.
 *
 * Returns the last used model (kv `last-model`) when it still resolves through models.resolveRoute, otherwise the first
 * enabled model of the earliest enabled connection whose provider is not globally disabled (manual models are used as listed; discovery uses the cached
 * catalogue), otherwise throws `NO_MODEL`. Never reads `llm.defaultModel` or the `MODEL` environment variable.
 */
export default async function (ctx: Context, _session: Session | null, _opts?: {}): Promise<string> {
    const last = String((await ctx.fns.procs.db.select({ sql: "SELECT value FROM kv WHERE key = 'last-model'", params: [] }) as Array<{ value: string }>)[0]?.value ?? "").trim();
    if (last) {
        try { return (await ctx.fns.models.resolveRoute({ route: last })).route; }
        catch { /* A removed connection or disabled model falls through to the first enabled model. */ }
    }
    const disabledProviders = await ctx.fns.models.disabledProviders({});
    for (const connection of await ctx.fns.models.list({})) {
        if (!connection.enabled || !connection.providerRegistered || disabledProviders.has(connection.provider)) continue;
        let models: types.models.ModelInfo[] = [];
        try { models = (await ctx.fns.models.listModels({ id: connection.id })).models; }
        catch { continue; }
        const first = models.find(model => !model.disabled && !connection.disabledModels.includes(model.id));
        if (first) return `${connection.provider}/${connection.accountName}:${first.id}`;
    }
    throw Object.assign(new Error("No enabled model connection has an enabled model"), { code: "NO_MODEL", status: 409 });
}
