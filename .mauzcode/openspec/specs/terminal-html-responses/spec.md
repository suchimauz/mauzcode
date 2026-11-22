# Terminal HTML responses

## Purpose

Define how an agent finishes a turn with an authored HTML fragment for display and a separate plain-text answer for conversation history.

<!-- Last verified: d35de7c2, 2026-11-22; inspected source and tests were clean. -->
<!-- sources: src/agent/respondHtml.ts, src/agent/sanitizeHtmlBody.ts, src/agent/run.ts, src/session/appendAssistantEvent.ts, src/session/appendEventWithHtml.ts -->

## Requirements

### Requirement: The tool returns an answer without publishing it

`respondHtml` SHALL return an acknowledgement and a terminal HTML payload containing the supplied markup and fallback text, without itself appending messages or events.

#### Scenario: Prepare a fragment
- **WHEN** `respondHtml` receives `<p>Hello</p>` and `Hello`
- **THEN** its output is `HTML response accepted; it will be sanitized and shown as the final answer.` and its terminal payload has type `html`, HTML `<p>Hello</p>` and text `Hello`

<!-- id: agent.respondHtml.return -->
<!-- kind: invariant -->
<!-- entities: respondHtml, terminal payload -->
<!-- enforced: src/agent/respondHtml.ts default export -->
<!-- test: src/agent/respondHtml.test.ts :: returns a side-effect-free terminal payload -->

### Requirement: Extract the display fragment

The runtime SHALL remove matched document declarations and wrapper tags, discard matched head, title, style, script and noscript blocks with their contents, and trim surrounding whitespace. These substitutions SHALL ignore case and otherwise preserve the remaining markup.

#### Scenario: A document contains a styled body fragment
- **WHEN** the supplied markup is `<!DOCTYPE html><HTML><head><style>p{margin:0}</style></head><BODY> <p class="card">Hi</p> </BODY></HTML>`
- **THEN** the display fragment is `<p class="card">Hi</p>`

#### Scenario: Non-content tags surround the answer
- **WHEN** the markup is `<meta charset="utf-8"><link rel="icon"><noscript>off</noscript><p>On</p>`
- **THEN** the display fragment is `<p>On</p>`

<!-- id: agent.sanitizeHtmlBody.trim -->
<!-- entities: HTML fragment -->
<!-- enforced: src/agent/sanitizeHtmlBody.ts default export -->
<!-- test: src/agent/sanitizeHtmlBody.test.ts :: full Haiku-style document is reduced to inner markup -->

### Requirement: Store tool results before finishing the turn

An active run receiving a successful terminal HTML tool result SHALL finish recording the batch's tool results before appending one final assistant answer. It SHALL return that answer with `terminal: true` without asking the model for another response.

#### Scenario: Successful terminal call
- **WHEN** the model calls `respondHtml` with text `Sessions list` and HTML containing a sessions heading
- **THEN** the assistant tool call is followed in history by the tool acknowledgement and then the final assistant answer, and no follow-up model response is requested

#### Scenario: Multiple successful HTML results in one batch
- **WHEN** two successful tool results in the same batch carry terminal HTML payloads
- **THEN** the last such payload supplies the final answer; an errored result does not replace it

<!-- id: agent.run.terminal-return -->
<!-- entities: tool result, assistant message, run -->
<!-- enforced: src/agent/run.ts:905,949-972 -->
<!-- test: src/agent/run.test.ts :: respondHtml stores the tool result, sanitizes HTML, publishes one final answer, and skips another LLM turn -->

### Requirement: Keep display HTML separate from history text

The final assistant message SHALL contain trimmed fallback text, or `HTML response` if that text is blank. The assistant event SHALL link to that message by index and carry the same text and the cleaned fragment marked as `assistant-answer` HTML.

#### Scenario: Fallback differs from the display markup
- **WHEN** the terminal payload contains text `  Summary  ` and HTML `<body><p>Full answer</p></body>`
- **THEN** the message content is `Summary`, and the linked event contains `Summary` as text and `<p>Full answer</p>` as HTML

#### Scenario: Both representations reduce to empty strings
- **WHEN** the text is whitespace and the only HTML is a matched style block
- **THEN** the final message and event use `HTML response` as text and the event's HTML is empty

<!-- id: agent.run.terminal-text -->
<!-- entities: assistant message, assistant event -->
<!-- enforced: src/agent/run.ts:951-964; src/session/appendAssistantEvent.ts default export; src/session/appendEventWithHtml.ts default export -->
<!-- test: src/agent/run.test.ts :: respondHtml stores the tool result, sanitizes HTML, publishes one final answer, and skips another LLM turn -->

<!-- uncertainty: The substitutions are not a general HTML safety guarantee. The cited run test covers one successful call, not multiple terminal results, whitespace-only text or empty display markup. -->
<!-- deferred: src/session/appendMessage.ts and src/session/appendEvent.ts are persistence boundaries; client rendering is outside this capability. -->
