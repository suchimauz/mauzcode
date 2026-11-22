# websearch-brave-provider Specification

## Purpose
Users with a Brave Search API key can search the web without a browser or a self-hosted service and receive results in the same format as other web search providers.

## Requirements

### Requirement: Brave API key setting
The websearch plugin SHALL declare a secret setting `websearch.braveApiKey` (env `WEBSEARCH_BRAVE_API_KEY`) shown in the plugin's Settings. The `brave` provider SHALL report `configured: true` only when the key resolves to a non-empty value. The key SHALL never be returned by any function, logged or included in an error.

#### Scenario: Key not set
- **WHEN** `websearch.braveApiKey` is empty
- **THEN** `websearch.providers` reports `brave` as not configured with a reason that names the setting

#### Scenario: Key set through Settings
- **WHEN** the user saves a key in Settings
- **THEN** `brave` becomes configured and Settings only shows that a secret is set

### Requirement: Brave web search request
The `brave` provider SHALL send one GET request to `https://api.search.brave.com/res/v1/web/search` with `q` set to the query, `count` set to the clamped limit (at most 20) and `extra_snippets=true`, the key only in the `X-Subscription-Token` header and `Accept: application/json`. The request SHALL be bounded to 10 seconds and SHALL NOT be retried or redirected to another host.

#### Scenario: Limit above maximum
- **WHEN** the caller asks for 50 results
- **THEN** the request uses `count=20`

### Requirement: Brave result mapping
The provider SHALL map each `web.results` item to the shared result shape: `title`, `url`, `description` without markup, `descriptionHtml` with the original snippet, `publishedAt` from `page_age`, `language`, `site` from `profile.name` and `extraSnippets` from `extra_snippets`. Missing fields SHALL be null or empty. A response without a `web.results` array SHALL fail with `invalid response shape`; an empty list SHALL return no results.

#### Scenario: Rich result
- **WHEN** Brave returns an item with `<strong>` in the description, `page_age`, `profile.name` and two extra snippets
- **THEN** the result has a plain `description`, the original `descriptionHtml`, an ISO `publishedAt`, `site` and both `extraSnippets`

### Requirement: Brave optional fields
`publishedAt` SHALL be `page_age` normalized to an ISO 8601 string when it parses as a date; the human-readable `age` SHALL NOT be used, so the field has one format. When `extra_snippets` is absent (some Brave plans), `extraSnippets` SHALL be `[]`.

#### Scenario: Plan without extra snippets
- **WHEN** Brave returns an item without `extra_snippets` and with only a human-readable `age`
- **THEN** the result has `extraSnippets: []` and `publishedAt: null`

### Requirement: Brave failure handling
HTTP 401 or 403 SHALL fail with `invalid API key`, 429 with `rate limited`, any other non-2xx status with `HTTP <code>`, a timeout with `request timed out` and other transport errors with `request failed`. These messages SHALL be thrown through `websearch.providerError`. Failures SHALL NOT trigger another provider and SHALL NOT include the response body, key or request URL.

#### Scenario: Wrong key
- **WHEN** Brave answers 401
- **THEN** the call fails with `websearch.search: brave: invalid API key`

#### Scenario: Timeout
- **WHEN** Brave does not answer within 10 seconds
- **THEN** the request is aborted and the call fails with `request timed out`
