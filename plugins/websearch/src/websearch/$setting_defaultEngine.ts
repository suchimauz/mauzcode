export default {
    type: 'enum',
    env: 'WEBSEARCH_DEFAULT_ENGINE',
    default: 'google-browser',
    // Registered provider ids, including ones added by other plugins; the static list applies when that fails.
    optionsFrom: 'websearch.providerIds',
    options: ['google-browser', 'openserp', 'brave'],
    title: 'Default web search engine',
    description: 'Ordinary provider used when no engine is specified and the issuing model does not supply native search.',
};
