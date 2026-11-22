/** One normalized web search result returned by websearch.search for every provider. */
export type SearchResult = {
    /** Result title as reported by the engine, markup removed. */
    title: string;
    /** Result URL: HTTP(S), without credentials or fragment. */
    url: string;
    /** Snippet with engine highlight markup removed. */
    description: string;
    /** Original snippet including the engine's `<strong>` highlight markup, when it provided any. */
    descriptionHtml: string | null;
    /** Publication or crawl date reported by the engine (ISO 8601 for Brave), when available. */
    publishedAt: string | null;
    /** Language code reported by the engine, when available. */
    language: string | null;
    /** Site or profile label reported by the engine, when available. */
    site: string | null;
    /** Additional page excerpts returned by the engine; often enough to answer without opening the page. */
    extraSnippets: string[];
};
