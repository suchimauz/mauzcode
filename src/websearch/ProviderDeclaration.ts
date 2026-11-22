/**
 * Default export of a `$websearchProvider_<id>.ts` declaration file (`<id>` is kebab-case).
 *
 * Handlers are runtime function names `<namespace>.<fn>` in a namespace of the declaring module or plugin; they
 * are called by websearch core with `{ query, limit }` (search) and `{}` (status). Throw
 * `await ctx.fns.websearch.providerError({ message })` for a message callers may see; any other error becomes
 * `request failed`.
 */
export type ProviderDeclaration = {
    /** Declaration contract version; must be 1. */
    apiVersion: 1;
    /** Short human label shown in Settings and websearch.providers. */
    label: string;
    /** One-line description of the provider and what it needs. */
    description: string;
    handlers: {
        /** Runtime function returning `types.websearch.ProviderSearchResult` for `types.websearch.ProviderSearchOpts`. */
        search: string;
        /** Optional runtime function returning `types.websearch.ProviderStatus`; absent means always configured. */
        status?: string;
    };
    /** Setting keys (`module.key`) that configure the provider; named in not-configured errors. */
    settings?: string[];
};
