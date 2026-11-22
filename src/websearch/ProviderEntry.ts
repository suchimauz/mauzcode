/** One registered web search provider in `ctx.state.websearch.providers`. */
export type ProviderEntry = {
    /** Kebab-case provider id from the declaration file name. */
    id: string;
    /** Mounted module root that declared the provider; providers follow their owner's lifetime. */
    owner: string;
    /** Declaration path inside its owner. */
    rel: string;
    /** Absolute declaration path, used to detect deletions on a full boot pass. */
    abs: string;
    label: string;
    description: string;
    handlers: { search: string; status?: string };
    settings: string[];
};
