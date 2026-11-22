export default {
    apiVersion: 1,
    label: 'Google (browser)',
    description: 'Google search in the user’s Chrome; needs the browser plugin, no API key.',
    handlers: { search: 'websearch.googleBrowserSearch' },
} satisfies types.websearch.ProviderDeclaration;
