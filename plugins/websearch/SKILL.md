---
name: websearch
description: "Provider-neutral public web search, grounded answers with verified citations, and focused page processing. Use to retrieve ranked links through Google Browser, the Brave Search API, an operator-run OpenSERP service or a plugin-provided search provider, answer a question from the live web with quote-level citations, or open a selected public page and apply an LLM instruction to its readable content."
---

# Web Search and Fetch

Use `websearch.search` for ranked public-web links and snippets. It returns one stable result shape across pluggable search providers. Built-in providers:

- `google-browser` — Google Search through the user's real Chrome; the default engine and useful for independent comparison.

- `brave` — the [Brave Search API](https://brave.com/search/api/); needs no browser and no service, only a key in the secret setting `websearch.braveApiKey` (a `secret://` or `env://` reference; the env var `WEBSEARCH_BRAVE_API_KEY` also works). One request per search, bounded to 10 seconds, no retries. `publishedAt` is an ISO date from Brave's `page_age`; `extraSnippets` is empty on plans without extra snippets. Failures are `invalid API key`, `rate limited`, `HTTP <code>`, `invalid response shape`, `request timed out` or `request failed` — never the key, URL or response body.

- `openserp` — optional HTTP search via an operator-run OpenSERP service (tested with 0.8.14). DuckDuckGo first, Bing once only on HTTP/transport/timeout/invalid response or no usable results. Each attempt is bounded to 10 seconds and the requests share a 20-second budget. Both failing throws a concise error, never fabricated results. `sourceEngine` reports the engine whose results were actually used. Search needs no Chrome or paid API; `answer`, `fetch` and page reading still require the browser.

Configure `websearch.openserpEndpoint` (default `http://127.0.0.1:7000`) with an HTTP(S) base URL, optionally including a base path, without credentials, query or fragment. The service must expose `/duckduckgo/search` and `/bing/search`; redirects and authentication are not supported. MauzCode does not start or manage the service.

## Choosing a provider

Pass `engine` (a provider id) to `websearch.search` or `websearch.answer` to pick a provider for one call. When omitted inside a capable model tool step, search uses that step’s provider and account. Its `engine` result (`native:<id>`) is provenance, not a selectable engine. Failure does not fall back. Outside that step or for a model without native search, `websearch.defaultEngine` applies (default `google-browser`). Settings lists only ordinary engines. The synthesis `model` on `answer` never selects the search account. `websearch.providers({})` lists providers with `label`, `owner`, `configured`, `reason` and `isDefault` — check it before choosing a browser-free engine.

There is **no fallback**: an unknown engine fails with the list of available ids, and an unconfigured one (for example `brave` without a key) fails with the reason and the setting to configure. Websearch never silently switches to another provider. Search is retrieval-only and does not generate an LLM answer.

Every provider's results are normalized by websearch: HTTP(S) URLs only, no credentials or `#fragment`, no duplicate URLs, markup stripped from `title` and `description`, at most `limit` (1..20). `descriptionHtml` keeps the original snippet markup. `publishedAt`, `language`, `site` and `extraSnippets` are part of the shared shape; providers that do not report them leave them null/empty.

## Adding a provider from another plugin

A mounted module or plugin adds a provider with one declaration file `$websearchProvider_<id>.ts` (`<id>` kebab-case) naming runtime functions of its **own** namespace:

```ts
// plugins/acme/src/acme/$websearchProvider_acme-search.ts
export default {
    apiVersion: 1,
    label: 'Acme Search',
    description: 'Acme search API; needs acme.apiKey.',
    handlers: { search: 'acme.webSearch', status: 'acme.webSearchStatus' },
    settings: ['acme.apiKey'],
} satisfies types.websearch.ProviderDeclaration;
```

`search({ query, limit })` returns `{ results, sourceEngine? }` (`types.websearch.ProviderSearchResult`); the optional `status({})` returns `{ configured, reason? }` and is bounded to 2 seconds. Throw `ctx.fns.websearch.providerError({ message })` for a short failure callers may see (`rate limited`); any other error becomes `request failed`, so never rely on raw error text. A broken, foreign-handler or duplicate declaration is rejected (`websearch.provider.rejected` in the log) without affecting other providers; unmounting the plugin removes its provider.

## Ranking and filtering results

Engines rank by their own signals, so a result that merely shares keywords can outrank the one that answers the question — and finding out costs a page load. Rerank with `jev.rank`: pass the results as candidates (title + description + extraSnippets), set `minScore` around 0.2, and keep what survives. Jev returns a calibrated relevance score per candidate, so the threshold means the same thing across queries; a result that is merely on-topic scores far below one that answers the question. `jev.rank` scores candidates concurrently and keeps a failed candidate in place rather than dropping it.

```ts
const found = await ctx.fns.websearch.search({ query, limit: 10 });
const ranked = await ctx.fns.jev.rank({
  query,
  candidates: found.results.map((r, i) => ({ id: String(i), text: [r.title, r.description, ...r.extraSnippets].join('\n') })),
  minScore: 0.2,
});
const best = ranked.ranked.map((entry) => found.results[Number(entry.id)]);
```

Use `websearch.fetch` on a selected result URL with a focused prompt. It opens the URL through Browser, captures readable Markdown, and asks an LLM to apply the prompt. The model can be overridden per call; otherwise `websearch.fetchModel` is used, falling back to MauzCode's global default model. Authenticated/private pages are not guaranteed; use a specialized plugin for those.

Fetch keeps the evidence, not only the summary: `markdown` holds the readable page as captured, so a claim can be quoted instead of trusted. Pass `includeMarkdown: false` when only the generated answer is wanted.

## Grounded answers

Use `websearch.answer` when the question matters more than the links. One call searches, reads the top `pages` results as Markdown, and returns `{ answer, citations, sources }`. Each citation carries a `quote` and a `verified` flag: the quote is matched back against the page text it was attributed to, so an invented quote arrives as `verified: false` instead of silently passing. Pass `requireVerified: true` to drop unverifiable citations, and read `sources` to see which pages failed to load.

## Reading one page as data

`websearch.read` opens a URL and returns readable Markdown with no LLM involved. It re-snapshots until the extracted length stops growing, so client-rendered pages are not captured half-empty, and it always closes the tab. `fetch` and `answer` both read through it.

## Long pages

`answer` does not truncate an over-long page at a character limit: passages are scored with `jev.rank` and only the relevant ones reach the model, so the answer survives even when the useful section sits at the bottom of the page.
