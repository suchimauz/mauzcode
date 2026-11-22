/** Return a fixed public search result without performing network I/O. */
export default function (_ctx: Context, _session: Session|null, _opts: types.websearch.ProviderSearchOpts): types.websearch.ProviderSearchResult {
    return {results:[{url:'https://acme.test/page#section', title:'<b>Acme</b>'}]};
}
