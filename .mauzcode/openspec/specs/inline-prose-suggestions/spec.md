# Inline prose suggestions

## Purpose
Describe how the Autotext lab proposes an insertion or a limited replacement at the cursor without applying it to the article draft until accepted. Lengths below count UTF-16 code units unless otherwise stated.

<!-- source: frontend/src/core-ui/utilities.tsx; src/autotext/$route__GET.ts; src/autotext/$route_suggest_POST.ts -->
<!-- last_verified: d35de7c2, 2026-11-22; inspected source and tests, not executed -->

## Requirements

### Requirement: Open the lab
GET /autotext SHALL redirect to the native Autotext utility.

#### Scenario: Visit the standalone URL
- **WHEN** a reader opens `/autotext`
- **THEN** the response is a 302 redirect to `/?view=extension:utilities/autotext`.

<!-- id: autotext-get-redirect -->
<!-- entities: Autotext page -->
<!-- enforced: src/autotext/$route__GET.ts default export -->
<!-- test: src/autotext/routes.test.ts :: redirects to native utilities -->

### Requirement: Choose the text at the cursor
The lab SHALL split the draft at the selection start and request a suggestion from the selected route only when the page permits requests, a model is available and the prefix is not blank.

#### Scenario: Request with a selection
- **WHEN** a writer selects a word after a nonblank prefix and requests a suggestion on a writable page with a model selected
- **THEN** the request sends that route, the prefix before the selection and the entire remainder starting with the selected word.

#### Scenario: No usable prefix
- **WHEN** the cursor is before the first non-whitespace character and a suggestion is requested
- **THEN** the lab makes no suggestion request.

<!-- id: autotext-suggest-cursor -->
<!-- entities: draft, cursor, model route -->
<!-- enforced: frontend/src/core-ui/utilities.tsx Autotext.suggest -->
<!-- test: frontend/src/test/utilities-extension.test.tsx :: suggestion sends the selected enabled connection route -->

### Requirement: Select a bounded rewrite suffix
The lab SHALL take at most the last 300 units of the prefix segment following its last delimiter, or of the whole prefix if none exists. A delimiter is one whitespace character immediately following `.`, `!`, `?` or a newline.

#### Scenario: Rewrite the current fragment
- **WHEN** the prefix is `First.  Next` and Fix sentence and continue is enabled
- **THEN** the request enables rewrite and sends the tail ` Next`, retaining the second space.

#### Scenario: Too little to rewrite
- **WHEN** the tail has fewer than two units or the writer disables the rewrite option
- **THEN** the request selects continuation rather than rewrite.

<!-- id: autotext-suggest-tail -->
<!-- entities: draft prefix, rewrite tail -->
<!-- enforced: frontend/src/core-ui/utilities.tsx Autotext.suggest -->

### Requirement: Reject invalid requests before inference
The suggestion endpoint SHALL reject failed CSRF checks, oversized bodies, malformed JSON and invalid cursor context without calling the model.

#### Scenario: Request checks
- **WHEN** CSRF verification fails
- **THEN** the endpoint returns 403; after successful verification it instead returns 413 if the declared byte length or decoded body length exceeds 24000, and 400 for malformed JSON within those bounds.

#### Scenario: Invalid draft with a resolved route
- **WHEN** either cursor side is not a string, their combined length exceeds 16000, or the prefix is blank
- **THEN** the endpoint returns 400 without requesting a completion.

<!-- id: autotext-suggest-post-input -->
<!-- entities: suggestion request, draft -->
<!-- enforced: src/autotext/$route_suggest_POST.ts default export, verifyCsrf and body checks -->
<!-- test: src/autotext/routes.test.ts :: CSRF and input bounds stop calls; NO_SUGGESTION is empty -->

### Requirement: Return insertion text verbatim
For continuation, the endpoint SHALL provide the model with the last 10000 prefix units and first 3000 suffix units at most, and return the model text unchanged except for the no-suggestion marker.

#### Scenario: A continuation starts with a space
- **WHEN** the model returns a continuation beginning with whitespace
- **THEN** the response preserves that whitespace, reports the resolved route and rounded elapsed milliseconds, and supplies no replacement count.

#### Scenario: No useful continuation
- **WHEN** the trimmed model text equals `NO_SUGGESTION` ignoring case
- **THEN** the returned text is empty.

<!-- id: autotext-suggest-post-continuation -->
<!-- entities: insertion, model response -->
<!-- enforced: src/autotext/$route_suggest_POST.ts default export, continuation branch -->
<!-- test: src/autotext/routes.test.ts :: accepts a new custom native model with a bounded neutral call and preserves whitespace -->
<!-- verified_by: src/autotext/routes.test.ts :: CSRF and input bounds stop calls; NO_SUGGESTION is empty -->

### Requirement: Bound and validate replacements
When rewrite is explicitly true, the endpoint SHALL accept only a string tail of 2–300 units matching the end of the prefix, and return a replacement only from parsed JSON with a string text field of at most 600 units.

#### Scenario: Valid rewrite
- **WHEN** the supplied tail matches and the model returns usable JSON
- **THEN** the response includes its text and `replaceChars` equal to the original tail length; the prompt separates the tail from at most 2500 preceding units and 1000 following the cursor.

#### Scenario: Invalid tail or unusable output
- **WHEN** the tail fails validation
- **THEN** the endpoint returns 400 before inference; if the tail passes but the model output cannot be parsed or its text field fails validation, it returns 422 instead of a replacement.

<!-- id: autotext-suggest-post-rewrite -->
<!-- entities: tail, replacement range -->
<!-- enforced: src/autotext/$route_suggest_POST.ts default export, rewrite branch -->
<!-- test: src/autotext/routes.test.ts :: rewrite validates tail and structured output -->

### Requirement: Report inference failure without retrying another route
The endpoint SHALL issue at most one model call with the resolved model, request signal, 15000 ms timeout and 300-token limit, and SHALL NOT select another route on failure.

#### Scenario: Route or provider unavailable
- **WHEN** route resolution or the model call throws an ordinary non-syntax error
- **THEN** the endpoint returns 400 with `Suggestion unavailable or timed out`, without trying an alternate model.

<!-- id: autotext-suggest-post-call -->
<!-- entities: model route, suggestion error -->
<!-- enforced: src/autotext/$route_suggest_POST.ts default export, models.call and outer catch -->
<!-- test: src/autotext/routes.test.ts :: provider failure never selects an alternate model -->

### Requirement: Preview before changing the draft
The lab SHALL leave the draft unchanged on receipt of a suggestion or error and apply a nonempty preview only on acceptance.

#### Scenario: Accept an insertion or replacement
- **WHEN** the writer accepts a preview with the button or Tab
- **THEN** its text replaces the range ending at the request cursor and spanning `replaceChars` units (zero if absent); text outside that range is preserved and the preview closes.

#### Scenario: No applicable result
- **WHEN** a request returns empty text, fails, or is cancelled
- **THEN** no preview from it is shown; a failure of a non-aborted request displays an alert, while Escape dismisses a preview without applying it.

<!-- id: autotext-accept-preview -->
<!-- entities: preview, article draft, alert -->
<!-- enforced: frontend/src/core-ui/utilities.tsx Autotext.suggest, cancel and accept -->

<!-- uncertainty: The inspected UI tests do not exercise mid-selection boundaries, tail delimiters, acceptance or cancellation races. Prompt instructions do not guarantee linguistic quality. -->
<!-- deferred: frontend/src/extensions/installed.ts (extension registration); model provider internals and normal chat editing are outside scope. -->
