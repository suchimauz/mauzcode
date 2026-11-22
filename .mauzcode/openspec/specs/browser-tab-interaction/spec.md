# Browser tab interaction

## Purpose

Describe which tab an agent's session selects, what a snapshot tells the caller, how page actions report their effects, and which page a human live-view link opens.

<!-- Last verified: 2026-11-22 at d35de7c2; source inspection only. -->

## Requirements

### Requirement: Resolve the calling agent's session
Session resolution SHALL use an active binding's session and target, reject conflicting explicit choices, and reject inactive bindings rather than falling back to another tab.

#### Scenario: Implicit and explicit choices
- **WHEN** a bound caller omits both choices
- **THEN** resolution returns the bound session and target; explicitly requesting a different session or target instead raises a mismatch error.

#### Scenario: Revoked binding
- **WHEN** the caller's binding is revoked
- **THEN** resolution fails with the binding state even if no explicit choice was supplied.

<!-- id: cdp.scope.binding-state -->
<!-- entities: agent, session, target -->
<!-- enforced: plugins/browser/src/cdp/scope.ts (cdp.scope); plugins/browser/src/cdp/session.ts (cdp.session) -->
<!-- test: plugins/browser/src/cdp/binding.test.ts:20; plugins/browser/src/cdp/binding.test.ts:27 -->

### Requirement: Compare page snapshots by revision
An interactive snapshot SHALL label referenced elements with its revision. An explicit comparison SHALL report structural differences against a retained revision of the same session or reject an unknown revision.

#### Scenario: A button is renamed
- **WHEN** the caller compares a fresh snapshot with the revision taken before a button label changed
- **THEN** the comparison reports the old and new labels, and the new snapshot has its own revision.

<!-- id: browser.snapshot.since-revision -->
<!-- entities: snapshot, revision, element ref -->
<!-- enforced: plugins/browser/src/browser/snapshot.ts (browser.snapshot) -->
<!-- test: plugins/browser/src/browser/snapshot.test.ts:30; plugins/browser/src/browser/snapshot.test.ts:48; plugins/browser/src/browser/snapshot.test.ts:81 -->

### Requirement: Report bounded text
A text snapshot SHALL report truncation when its character limit cuts off page text.

#### Scenario: Text exceeds the requested budget
- **WHEN** two lines of text would exceed a 500-character budget
- **THEN** the returned content fits that budget and the snapshot reports that it was truncated.

<!-- id: browser.snapshot.text-truncated -->
<!-- entities: snapshot, page text -->
<!-- enforced: plugins/browser/src/browser/snapshot.ts (browser.snapshot) -->
<!-- test: plugins/browser/src/browser/snapshot.test.ts:40 -->

### Requirement: Preserve completed action results
A page action batch SHALL process steps in order and stop at the first failed step, returning its failure alongside the results of completed steps.

#### Scenario: Second step fails
- **WHEN** the first of three steps succeeds and the second fails
- **THEN** the caller receives one completed result and a failure at index 1; the third step does not run.

<!-- id: browser.act.failed-step -->
<!-- entities: session, action batch, step result -->
<!-- enforced: plugins/browser/src/browser/act.ts (browser.act) -->

### Requirement: Select native options
Native option selection SHALL match requested values or trimmed visible labels exactly, return selected option values, and reject a request containing a missing option.

#### Scenario: Select by label
- **WHEN** a requested label matches an option whose value differs from its label
- **THEN** selection returns the option value rather than the label.

#### Scenario: Missing option
- **WHEN** a requested option does not exist
- **THEN** selection fails with OPTION_NOT_FOUND rather than silently selecting the available subset.

<!-- id: browser.act.select -->
<!-- entities: select element, option, label -->
<!-- enforced: plugins/browser/src/browser/select.ts (browser.select); plugins/browser/src/browser/act.ts (executeAction) -->
<!-- test: plugins/browser/src/browser/select.test.ts:29; plugins/browser/src/browser/select.test.ts:37 -->

### Requirement: Resolve a live-view link
Live-view link creation SHALL choose an open non-DevTools page from the selected browser endpoint and return its target ID, title and page URL alongside the viewer URL.

#### Scenario: No tab specified
- **WHEN** the caller omits the tab
- **THEN** the link identifies the first eligible page in endpoint listing order, or creation fails if there is none.

#### Scenario: Explicit tab is missing
- **WHEN** a supplied tab, after named-session lookup on the default endpoint, identifies no eligible page
- **THEN** creation fails instead of returning a link for another page.

<!-- id: browser.live-view.target-id -->
<!-- entities: live-view link, page, target -->
<!-- enforced: plugins/browser/src/browser/liveView.ts (browser.liveView) -->

### Requirement: Keep a live-viewed target open during idle cleanup
The idle sweep SHALL spare an otherwise idle owned target while a registered live viewer identifies that target.

#### Scenario: Idle tab with a connected viewer
- **WHEN** the sweep encounters an eligible idle target with a matching live connection
- **THEN** it refreshes activity for that target's session handles without closing the tab.

<!-- id: cdp.sweep-idle.live-target -->
<!-- entities: target, session handle, live viewer -->
<!-- enforced: plugins/browser/src/cdp/sweepIdle.ts (cdp.sweepIdle) -->

<!-- uncertainty: The inspected live.test.ts covers viewer transport and input, not liveView link selection or idle sweeping. No end-to-end browser behavior was exercised. -->
<!-- deferred: plugins/browser/src/browser/liveConnect.ts (frame delivery and input forwarding). -->
