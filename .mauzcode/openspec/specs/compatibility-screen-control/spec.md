# Compatibility screen control

## Purpose

Distinguish sending a command from receiving a document's answer, and describe how a guide presents one tour step without waiting for a human response.

<!-- Last verified: 2026-11-22 at d35de7c2; source inspection only. -->

## Requirements

### Requirement: Dispatch is not execution
UI evaluation and named actions SHALL reject blank input; otherwise they SHALL record a pending request and return its ID and dispatch acknowledgement without waiting for a document.

#### Scenario: No consumer answers
- **WHEN** a caller supplies nonblank code or an action name and no consumer replies
- **THEN** the corresponding `ui.eval` or `ui.action` event carries the trimmed input and ID, the caller gets `dispatched: true`, and looking up the ID still reports `pending`.

<!-- id: ui.action.dispatch -->
<!-- entities: UI request, event, dispatch receipt -->
<!-- enforced: src/ui/action.ts (ui.action); src/ui/eval.ts (ui.eval); src/ui/pending.ts (ui.pending) -->
<!-- test: src/ui/eval.test.ts:12; src/ui/eval.test.ts:22 (pending entries and emitted events) -->

### Requirement: Look up a document's reported outcome
The UI compatibility consumer SHALL report a value or failure against the request ID; the result endpoint SHALL update known entries and reject unknown IDs.

#### Scenario: Missing action handler
- **WHEN** the consumer receives a named action with no matching handler
- **THEN** it posts an `unknown action: <name>` failure to `/ui/eval/result`; once accepted, the request lookup reports `error` with that message.

#### Scenario: Successful evaluation
- **WHEN** the endpoint receives a successful evaluation report for a known ID
- **THEN** the lookup reports `ok` and the reported value, or null for an absent value; a report for an unknown ID instead receives HTTP 404.

<!-- id: ui.control-script.handle-action.result -->
<!-- entities: compatibility consumer, request ID, result entry -->
<!-- enforced: src/ui/controlScript.ts (handleAction, handleEval); src/ui/$route_eval_result_POST.ts (default export); src/ui/pending.ts (ui.pending) -->

### Requirement: Await a correlated screen reply
Screen evaluation SHALL wait for a matching result, retry once if still pending, and distinguish an unanswered request with subscribers from a timeout without subscribers.

#### Scenario: A document answers the request
- **WHEN** `/screen/result` receives a pending ID
- **THEN** the caller receives the posted value or, for a nonempty error, a rejection; a later reply for the settled ID is ignored.

#### Scenario: The event stream is silent
- **WHEN** no reply arrives by the evaluation timeout
- **THEN** a subscriber present at expiry yields `the page did not answer in <timeout>ms`; with no subscriber the error instead asks whether the workspace UI is open.

<!-- id: screen.eval.pending -->
<!-- entities: subscriber, screen request, reply -->
<!-- enforced: src/screen/eval.ts (screen.eval, listeners); src/screen/$route_result_POST.ts (default export) -->
<!-- test: src/screen.test.ts:14 (matching value); src/screen.test.ts:27 (silent subscriber) -->

### Requirement: Handle screen requests once per consumer
The compatibility consumer SHALL ignore repeated screen evaluation IDs and SHALL not evaluate or reply to a screen request without `window.page`.

#### Scenario: Duplicate delivery to one document
- **WHEN** the document receives the same screen request ID again
- **THEN** it skips the repeat even if the first event arrived before the page helper was available.

<!-- id: ui.control-script.apply-event.eval-ran -->
<!-- kind: invariant -->
<!-- entities: compatible document, screen request ID -->
<!-- enforced: src/ui/controlScript.ts (applyEvent) -->

### Requirement: Read structured screen state
A screen read SHALL pass the requested options to the responding document's page state helper and return its answer through screen evaluation.

#### Scenario: Request scoped text
- **WHEN** the caller requests a scope, text inclusion and a text limit
- **THEN** `window.page.state` receives those options and the caller awaits its result rather than receiving a dispatch receipt.

<!-- id: screen.read-screen.state -->
<!-- entities: screen read, state options -->
<!-- enforced: src/screen/readScreen.ts (screen.readScreen) -->
<!-- depends_on: screen.eval.pending -->

### Requirement: Separate tour presentation from human response
A structured step SHALL present one solo turn and return its presentation result without waiting for the person's next action. Replacing a step SHALL NOT count as a press.

#### Scenario: Guide replaces the current caption
- **WHEN** a valid step arrives while another is displayed
- **THEN** the new step takes its place without posting a press for the displaced step; the returned result includes the new caption and target status.

#### Scenario: The person responds
- **WHEN** the person chooses Next, ends the tour, or clicks the highlighted control in a click step
- **THEN** the document sends `next`, `stop`, or `did-it`, respectively, to `/screen/press`, separately from the presentation result.

#### Scenario: A requested click cannot be performed
- **WHEN** the person advances a click step whose control is missing
- **THEN** the document reports `failed` and leaves the step visible with the reason.

<!-- id: screen.client.step.solo -->
<!-- entities: solo step, guide, press -->
<!-- enforced: src/screen/step.ts (screen.step); src/screen/client.js (step, press, tourEnd) -->
<!-- depends_on: screen.eval.pending -->
<!-- test: src/screen/step.test.ts:28; src/screen/step.test.ts:40; src/screen/step.test.ts:49; src/screen/step.test.ts:60; src/screen/step.test.ts:68; src/screen/step.test.ts:78 -->

<!-- uncertainty: A subscriber or dispatch receipt does not identify a particular responding tab. The cited tests were inspected, not run; no live browser or instance was used. -->
<!-- deferred: src/screen/$route_press_POST.ts (downstream press delivery) -->
