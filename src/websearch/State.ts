/** Web search provider registry owned by the websearch namespace. */
export type State = {
    /** Registered providers by id, filled by `$loader_websearchProvider.ts`. */
    providers?: Record<string, types.websearch.ProviderEntry>;
};
