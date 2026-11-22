export default {
    apiVersion: 1,
    label: 'Brave Search',
    description: 'Brave Search API; needs an API key (websearch.braveApiKey), no browser or service.',
    handlers: { search: 'websearch.braveSearch', status: 'websearch.braveStatus' },
    settings: ['websearch.braveApiKey'],
} satisfies types.websearch.ProviderDeclaration;
