export default {
    type: 'secret' as const,
    env: 'WEBSEARCH_BRAVE_API_KEY',
    default: null,
    title: 'Brave Search API key',
    description: 'secret:// or env:// reference to a Brave Search API subscription token; enables the brave web search provider. Falls back to WEBSEARCH_BRAVE_API_KEY.',
};
