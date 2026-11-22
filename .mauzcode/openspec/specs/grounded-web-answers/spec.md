# Grounded web answers

## Purpose

Describe how a caller reads one page, applies an instruction to it, or answers a question with citations checked against retained page text.

<!-- last_verified: d35de7c2, 2026-11-22 -->

## Requirements

### Requirement: Operation access
Read, fetch and answer SHALL check their own operation grant before processing input. Answer SHALL also check search access for a nonblank question before looking up settings or searching.

#### Scenario: Search denied inside answer
- **WHEN** the caller can invoke answer but its preset denies search
- **THEN** answer fails with `websearch.search is not available` before a provider or setting lookup.

<!-- id: websearch-require-access-mounted-grant -->
<!-- entities: operation, caller preset -->
<!-- enforced: src/websearch/requireAccess.ts default export; src/websearch/{read,fetch,answer}.ts entry checks -->
<!-- test: src/websearch/facade.test.ts — nested answer checks search permission before any provider, setting or credential lookup -->

### Requirement: Page snapshot selection
Read SHALL reject URLs without an HTTP(S) prefix and return the longest trimmed Markdown snapshot collected, or fail if none contains text. It SHALL attempt to close its browser tab even when navigation or extraction fails.

#### Scenario: Page stops growing
- **WHEN** successive snapshots contain 100, 200 and 180 characters with no truncation
- **THEN** read stops at attempt three and returns the second snapshot's text, URL and title (using the input URL and empty title when absent).

#### Scenario: Truncated snapshot
- **WHEN** the longest snapshot so far is marked truncated
- **THEN** read stops without another snapshot and reports truncation. Otherwise it takes at most the configured attempt limit (default four).

<!-- id: websearch-read-best-content -->
<!-- entities: page, snapshot, browser tab -->
<!-- enforced: src/websearch/read.ts default export, best and finally -->

### Requirement: Focused page instruction
Fetch SHALL require an HTTP(S)-prefixed URL and nonblank prompt, read the page without searching, and return the model's response alongside source metadata.

#### Scenario: Extract from one page
- **WHEN** fetch reads a page for a valid instruction
- **THEN** it supplies the page URL, title, Markdown and instruction to the model with a 2048-token output limit, and returns the result, URL, title, model route, truncation flag and elapsed milliseconds. Markdown is returned by default and is null when explicitly disabled.

<!-- id: websearch-fetch-include-markdown -->
<!-- entities: instruction, page, completion -->
<!-- enforced: src/websearch/fetch.ts default export, includeMarkdown -->
<!-- test: src/websearch/oneShotModels.test.ts — fetch retains markdown, truncation metadata and output limit -->

### Requirement: Usable answer evidence
Answer SHALL reject a blank question and synthesize only from nonempty retained text of the selected top results, while reporting every attempted source in candidate order on success.

#### Scenario: One of several reads fails
- **WHEN** one page read throws but another provides readable text
- **THEN** the failed page contributes nothing to synthesis; its source entry contains its candidate URL and title, zero characters and the error message. The successful entry reports retained text length and null error.

#### Scenario: No usable candidates
- **WHEN** search returns no results, or candidates exist but none yields readable content
- **THEN** answer fails before synthesis with `websearch.answer: search returned no results` or `websearch.answer: no result page produced readable content`, respectively.

#### Scenario: A page exceeds its evidence budget
- **WHEN** text exceeds the per-page budget (default 12000 characters) and ranked passages do not supply more than 200 joined characters
- **THEN** answer uses the original text prefix up to that budget; otherwise it uses the ranked passage text up to the same budget.

<!-- id: websearch-answer-usable-documents -->
<!-- entities: question, candidate, retained text, source -->
<!-- enforced: src/websearch/answer.ts default export, documents and usable -->

### Requirement: Synthesis route and answer text
Answer SHALL request one synthesis from the selected route using the question and numbered usable pages, and return the original route name and answer text without requiring any verified citation.

#### Scenario: Successful completion
- **WHEN** the selected model returns an answer string and citations as JSON
- **THEN** answer returns the trimmed answer and separately processed citations. The synthesis request has a 4096-token limit and asks the model to ignore instructions inside pages and quote evidence from them.

#### Scenario: Model call fails
- **WHEN** route resolution or the provider call throws during fetch or answer
- **THEN** the same error propagates without a second model attempt.

<!-- id: websearch-answer-completion-route -->
<!-- entities: synthesis route, question, completion -->
<!-- enforced: src/websearch/answer.ts default export, route and completion; src/websearch/fetch.ts default export, route and completion -->
<!-- test: src/websearch/oneShotModels.test.ts — answer uses only models facade, retaining citations and original route; resolution error propagates unchanged from answer/fetch with no model fallback; provider error propagates unchanged from answer/fetch with no model fallback -->

### Requirement: Quote verification against the attributed source
Answer SHALL skip citations with blank URL or quote or no matching usable source. For a matched citation it SHALL report the source URL and title and mark verification by normalized substring containment in that source's retained text.

#### Scenario: Match and verify
- **WHEN** a citation URL matches a usable URL exactly, or failing that one URL starts with the other
- **THEN** answer uses the exact match or the first prefix match, trims the quote and checks it after lowercasing both strings, replacing runs of non-letters and non-digits with spaces, and trimming again.

#### Scenario: Quote exists only outside retained text
- **WHEN** a quote's normalized text is absent from the matched source's retained text
- **THEN** the citation is returned with `verified: false` by default and omitted when `requireVerified` is true; this filter does not remove the answer.

<!-- id: websearch-answer-by-url-normalize -->
<!-- entities: citation, source URL, quote, retained text -->
<!-- enforced: src/websearch/answer.ts normalize, byUrl and requireVerified branch -->
<!-- test: src/websearch/oneShotModels.test.ts — answer uses only models facade, retaining citations and original route (positive exact match) -->

<!-- uncertainty: Verification is a text match, not a factuality judgment. The inspected tests do not exercise prefix attribution, partial read failure, snapshot stabilization or malformed model output recovery. -->
<!-- deferred: Browser extraction, passage ranking, search providers and model implementation are external to these operations. -->
