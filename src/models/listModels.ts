/**
 * List a connection's models from its persistent cache, refreshing from the provider on demand
 *
 * Use to fill model pickers for one connection. The provider's model list is cached in Postgres per connection and never expires: without `refresh` the cached list is returned without network access; the provider is asked only when `refresh` is true (the "Update models" button and the hourly models.refreshAll) or when nothing is cached yet. A successful discovery (sanitized, de-duplicated) replaces the cache; a failed one keeps the previous cache and reports `error`. Without a cache and without a provider list, for a disabled connection or for a globally disabled provider (models.disabledProviders), returns the cached or manual `config.models` ids — including on refresh, without any provider request. `source` says which list was returned, `cachedAt` is when the provider list was fetched. Every model carries `disabled: true` when the owner disabled it on this connection (models.setModelEnabled); disabled models stay listed. Disabled connections never touch the network.
 * @param opts.id Connection UUID.
 * @param opts.refresh Ask the provider now and update the cache. @default false
 * @param opts.cacheOnly Read cache or manual ids only, even on a cold cache; never resolve credentials or call a provider. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Ask the provider now and update the cache. */
        refresh?: boolean;
        /** Read cache or manual ids only, even on a cold cache; never resolve credentials or call a provider. @default false */
        cacheOnly?: boolean;
    },
): Promise<{ models: types.models.ModelInfo[]; source: "provider" | "manual"; cachedAt: number | null; error?: string }> {
    return ctx.fns.models.catalog.listModels(opts);
}
