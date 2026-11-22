# Conversation history search

## Purpose
Distinguish literal search within one viewer-owned conversation from keyword and pattern searches across persisted transcripts.

Last verified: 2026-11-22 at `d35de7c21ff42cdbfb2db0272d6874d4db17a4e0` by source inspection; tests were not run.

## Requirements

### Requirement: Ownership across the fork chain
Chat search SHALL resolve a viewer and verify ownership of the requested chat and every ancestor before reading messages. It SHALL reject missing nodes, repeated nodes and chains longer than 64 nodes.

#### Scenario: Owned child with an unavailable parent
- **WHEN** a viewer searches their own fork but does not own its parent
- **THEN** the search fails without querying messages, even with a cursor inside the child segment.

<!-- id: chat-search-history-owner-chain -->
<!-- kind: invariant -->
<!-- entities: viewer, conversation, ancestor -->
<!-- enforced: src/chat/searchHistory.ts#chat.searchHistory; src/auth/viewerId.ts#auth.viewerId -->
<!-- test: src/chat/searchHistory.test.ts :: ownership and ancestor checks precede any message query -->

### Requirement: Fork prefixes by position
Chat search SHALL number persisted rows in conversation order, cutting inherited history at each non-null fork offset before appending the child's rows in message-index order.

#### Scenario: Parent indexes are not contiguous
- **WHEN** a child forks at position two from parent rows indexed 5, 10 and 15
- **THEN** the first two parent rows precede the child's own rows in search order; parent index 15 cannot produce a hit.

<!-- id: chat-search-history-segments -->
<!-- entities: fork, message, ordinal -->
<!-- enforced: src/chat/searchHistory.ts#chat.searchHistory -->
<!-- test: src/chat/searchHistory.test.ts :: fork prefix is array-position based, not idx; searches full persisted own and inherited history -->

### Requirement: Literal readable text
Chat search SHALL match case-insensitive literal substrings of user and assistant rows whose message type is absent, `message` or `agent_message`, without excluding rows merely because they were excluded from model context.

#### Scenario: Query contains markup and wildcards
- **WHEN** a query contains `%_ [x] <b>`
- **THEN** those characters must occur together as text; matching does not expand wildcards or add highlight markup.

#### Scenario: Message stored as a recognized block array
- **WHEN** content starts with `[` and parses as a JSON array containing only text, image, document or their supported reference blocks
- **THEN** only text-block text contributes to the search, joined in order by newlines; attachment fields do not contribute. For unrecognized arrays the stored content is searched as text instead.

<!-- id: chat-search-history-readable -->
<!-- entities: message, content block, query -->
<!-- enforced: src/chat/searchHistory.ts#chat.searchHistory -->
<!-- test: src/chat/searchHistory.test.ts :: literal metacharacters and HTML stay literal, bounded snippets and cursor pages -->

### Requirement: Cursor pages and previews
Chat search SHALL return matching messages in ascending ordinal order after an exclusive cursor, with source agent, index, role, ordinal and a plain-text preview for each hit.

#### Scenario: Another page exists
- **WHEN** more matches remain than the page limit (default 30, allowed 1–50)
- **THEN** `next` is the last returned ordinal; continuing after it skips that hit. On the last or empty page `next` is null.

#### Scenario: Long message
- **WHEN** the first match occurs deep within a message
- **THEN** the snippet starts up to 160 characters before that match and contains at most 1200 characters; `truncated` indicates whether the searchable text exceeds 1200 characters.

<!-- id: chat-search-history-matches -->
<!-- entities: hit, ordinal, snippet -->
<!-- enforced: src/chat/searchHistory.ts#chat.searchHistory -->
<!-- test: src/chat/searchHistory.test.ts :: literal metacharacters and HTML stay literal, bounded snippets and cursor pages -->

### Requirement: Chat search HTTP errors
The chat endpoint SHALL return non-cacheable JSON, distinguishing invalid query or cursor input (400) from a search failure (generic 403).

#### Scenario: Invalid input versus inaccessible conversation
- **WHEN** `q` is blank, longer than 200 UTF-16 code units or contains NUL, or `after` does not convert to a safe integer of at least −1
- **THEN** the route returns 400 without searching; with valid input a denied search returns 403 without identifying which ancestor failed.

<!-- id: chat-id-search-get-validation -->
<!-- entities: query, cursor, response -->
<!-- enforced: src/chat/$route_$id_search_GET.ts#default -->
<!-- test: src/chat/searchHistory.test.ts :: invalid cursors and limits reject, routes have no-store and generic forbidden responses -->

### Requirement: Shared transcript search endpoint
GET `/search` SHALL require a signed-in session and use the Accept header to distinguish JSON transcript results from a redirect to the search page, with no-store caching and `Vary: Accept`.

#### Scenario: Signed-in JSON request
- **WHEN** Accept contains `application/json`
- **THEN** the response echoes the trimmed query and optional agent ID (null if absent), with no hits for a blank query or up to 30 BM25 hits otherwise; the agent filter is optional, not a viewer-ownership filter.

#### Scenario: Browser visit or absent session
- **WHEN** a signed-in visitor requests another representation
- **THEN** the route redirects with 303 to `/?view=extension%3Adocumentation%2Fsearch`, carrying nonempty query and agent filters; without a signed-in session the route returns 401 instead.

<!-- id: search-get-accept -->
<!-- entities: visitor, transcript, response -->
<!-- enforced: src/$route_search_GET.ts#default -->
<!-- test: src/functionsRoute.test.ts :: transcript JSON keeps BM25 snippets and optional agent filter -->
<!-- test: src/functionsRoute.test.ts :: documentation and transcript data require a signed-in visitor -->
<!-- test: src/functionsRoute.test.ts :: legacy browser routes redirect with their filters -->

### Requirement: Ranked keyword hits
BM25 transcript search SHALL return indexed matches across agents or for one exact agent, highest score first, with the index-provided snippet rather than the full message.

#### Scenario: Keyword appears in two messages
- **WHEN** matching rows have different scores
- **THEN** the higher-scoring row comes first; each hit identifies the agent, index, role and timestamp and carries a numeric score and a snippet that can include `<b>` highlights. The default limit is 20; integer limits are clamped to 1–100.

<!-- id: session-search-bm25-score -->
<!-- entities: transcript, score, snippet -->
<!-- enforced: src/session/searchBm25.ts#session.searchBm25 -->
<!-- test: src/session/searchBm25.test.ts :: finds by keyword, ranks by relevance, filters by agent -->

### Requirement: Unranked transcript pattern search
The separate `session.search` procedure SHALL match non-null stored content across agents and roles using a case-insensitive SQL substring pattern and return full content newest timestamp first.

#### Scenario: Pattern rather than a literal query
- **WHEN** the trimmed query contains `%` or `_`
- **THEN** these characters retain SQL pattern semantics; hits include agent ID, index, role, content and timestamp rather than a highlighted preview. A blank query returns no rows; the default limit is 50.

<!-- id: session-search-ilike -->
<!-- entities: transcript, pattern, message -->
<!-- enforced: src/session/search.ts#session.search -->
<!-- test: src/session/search.test.ts :: matches substring in user messages across all agents -->

<!-- uncertainty: The inspected chat fixture substitutes prose for PostgreSQL block extraction. Mixed-block fallback, deep lineage, SQL wildcard behavior and tie ordering were not verified by execution; no secondary sort order is specified. -->
