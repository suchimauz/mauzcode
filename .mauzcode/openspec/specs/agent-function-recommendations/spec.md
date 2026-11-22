# Runtime function recommendations for a user turn

## Purpose
Explain when an agent retrieves runtime functions for a user turn, which candidates survive, and how the outgoing prompt presents them without changing the user's words.

<!-- Last verified: d35de7c2, 2026-11-22 (source inspection) -->

## Requirements

### Requirement: Select the latest ordinary user turn
Retrieval SHALL require explicit agent opt-in and use only the latest non-excluded ordinary user message as its query.

#### Scenario: Select query text
- **WHEN** `functionRagEnabled` is true and the latest eligible row contains nonblank text
- **THEN** retrieval uses the first 2000 code units of its trimmed text and identifies the turn by the row index (`idx`, otherwise its array position).

#### Scenario: Abstain without usable input
- **WHEN** opt-in is absent, no eligible user row exists, or the latest eligible row has blank or non-string content
- **THEN** the operation returns null without searching, rather than trying an older prompt.

<!-- id: agent.functionRag.query -->
<!-- entities: agent, user message -->
<!-- enforced: src/agent/functionRag.ts default export, messageIdx selection -->
<!-- test: src/agent/functionRag.test.ts:12 -->

### Requirement: Gate retrieval independently of reranking
An enabled gate SHALL skip search and reranking only for a valid tool-need score below 0.2; a disabled or failed gate SHALL permit search.

#### Scenario: Classify recent dialogue
- **WHEN** the gate evaluates a turn
- **THEN** its evidence is separate from instructions and contains at most the last six non-excluded ordinary, nonblank user or assistant messages through that turn, limited to the final 1200 code units each.

#### Scenario: Closed or failed gate
- **WHEN** a valid score in [0, 1] is below 0.2
- **THEN** the result reports a closed gate, the score, zero retrieved hits and no functions.
- **WHEN** the classifier fails or returns an invalid answer
- **THEN** retrieval proceeds with error gate status and no gate score.

<!-- id: agent.functionRagGate.decision -->
<!-- entities: gate, dialogue, tool-need score -->
<!-- enforced: src/agent/functionRagGate.ts default export; src/agent/functionRag.ts gate branch -->
<!-- test: src/agent/functionRagGate.test.ts:23,32 -->

### Requirement: Filter plain retrieval evidence
Without a successful rerank, recommendations SHALL retain at most five non-temporary qualifying hits in retrieval order from a hybrid search limited to twenty.

#### Scenario: Apply evidence-specific cutoffs
- **WHEN** hybrid search returns raw BM25 hits (including when embeddings are off) or fused hits
- **THEN** raw BM25 needs a positive score; exact-name, intersection, bm25-only and vector-only need a score of at least 0.015. Other evidence and names beginning with `tmp.` do not qualify.

#### Scenario: Lexical fallback is not a recommendation verdict
- **WHEN** indexed search throws and the fallback finds matches in loaded documentation
- **THEN** lexical hits count as retrieved but none qualify by lexical score alone.

<!-- id: agent.functionRag.functions.evidence -->
<!-- entities: search hit, recommendation -->
<!-- enforced: src/agent/functionRag.ts functions filter; src/runtime/docs/search.ts default export and lexical -->
<!-- test: src/agent/functionRagFallback.test.ts:16,28; src/runtime/docs/hybridSearch.test.ts:32 -->

### Requirement: Respect the optional rerank verdict
A successful rerank SHALL replace the plain evidence filter; a rerank failure SHALL restore plain selection.

#### Scenario: Select or abstain
- **WHEN** reranking is enabled and retrieval returns hits
- **THEN** only non-temporary candidates are submitted; a successful selection retains up to five scoring at least 0.3 in descending reranker score order, breaking ties by retrieval rank. An empty selection stays empty and does not change the gate score.

#### Scenario: Reranker unavailable
- **WHEN** the reranker throws
- **THEN** the result reports rerank error and returns the qualifying plain hits; when search itself yields no hits, reranking is skipped instead.

<!-- id: agent.functionRag.jevScores -->
<!-- entities: candidate, rerank status -->
<!-- enforced: src/agent/functionRag.ts jevScores; src/jev/selectFunctions.ts kept -->
<!-- test: src/agent/functionRagGate.test.ts:36,39,42; src/agent/functionRagFallback.test.ts:22 -->

### Requirement: Present recommendations separately from user text
World-state synchronization SHALL present changed nonempty recommendations in a cursor-excluded world-state row, not by rewriting the user's message during request construction.

#### Scenario: Present the catalogue once for a turn
- **WHEN** a new functions section is emitted
- **THEN** the relevant_runtime_functions block lists retrieval ranks, names, scores, summaries and compact signatures; the same ordered names for the same turn do not cause a repeat.

#### Scenario: No candidates survive
- **WHEN** the retrieval result contains no selected functions
- **THEN** synchronization records the empty selection and retrieved count in agent scratchpad without adding a candidate block.

<!-- id: agent.syncWorldState.functions -->
<!-- entities: world_state, user message, functions section -->
<!-- enforced: src/agent/syncWorldState.ts ragBlock and functions snapshot; src/agent/buildLlmRequest.ts default export -->
<!-- test: src/agent/functionRag.test.ts:22,52,65 -->

<!-- uncertainty: The inspected tests do not exercise a forced index failure through outgoing prompt construction. -->
<!-- deferred: src/agent/markFunctionRag.ts (asynchronous reporting); native tool discovery and generic decision-model behavior are outside this capability. -->
