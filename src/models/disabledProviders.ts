/**
 * Read the set of globally disabled model providers
 *
 * Reads the global setting models.disabledProviders through settings.get on every call without caching, so a toggle takes effect on the very next availability check. Returns a normalized Set of trimmed provider ids; ids of unregistered providers are kept and simply never match. Batch projections should call this once per request and test membership per connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<Set<string>> {
    const value = await ctx.fns.settings.get({ module: "models", scopeType: "global", key: "disabledProviders" });
    const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && !!id.trim()).map(id => id.trim()) : [];
    return new Set(ids);
}