export default {
    apiVersion: 1,
    label: 'OpenSERP',
    description: 'Operator-run OpenSERP service: DuckDuckGo, then Bing once; no browser or API key.',
    handlers: { search: 'websearch.openserpSearch', status: 'websearch.openserpStatus' },
    settings: ['websearch.openserpEndpoint'],
} satisfies types.websearch.ProviderDeclaration;
