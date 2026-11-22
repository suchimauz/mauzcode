# Canvas tab lifecycle

## Purpose

Describe how each agent's Canvas identifies, selects, remembers and restores tabs, and how it serves their documents.

<!-- Last verified: 2026-11-22 at d35de7c2 (source inspection; tests not run). -->

## Requirements

### Requirement: Show by content identity
Showing a registered kind SHALL open the agent's Canvas and activate the tab identified by that agent, kind and prepared arguments. An unknown kind SHALL be rejected.

#### Scenario: Duplicate shows
- **WHEN** concurrent shows resolve to the same kind and arguments on one agent
- **THEN** both identify one tab, not two; showing that open tab again does not move it in the strip.

#### Scenario: Show a previously closed match
- **WHEN** the matching tab is closed rather than open
- **THEN** it returns first in open-tab order with its original ID and state.

<!-- id: canvas.show.prepared-identity -->
<!-- entities: agent, tab, kind, arguments -->
<!-- enforced: src/canvas/show.ts (canvas.show); src/canvas/locked.ts (canvas.locked) -->
<!-- test: src/canvas/canvas.test.ts:105; src/canvas/canvas.test.ts:193 -->

### Requirement: Select an open tab
An explicit selection SHALL accept only an open tab of the specified agent or null to clear selection, without changing Canvas visibility unless requested.

#### Scenario: Closed or foreign tab
- **WHEN** an agent's selection is set to another agent's tab or a closed tab
- **THEN** the operation fails rather than switching tabs.

<!-- id: canvas.update.active-item -->
<!-- entities: agent, active tab -->
<!-- enforced: src/canvas/update.ts (canvas.update) -->
<!-- test: src/canvas/canvas.test.ts:57; src/canvas/canvas.test.ts:193 -->

### Requirement: Patch tab state
State patches SHALL merge top-level keys on an open tab of the specified agent, deleting null-valued keys and leaving unspecified keys unchanged.

#### Scenario: Independent concurrent edits
- **WHEN** two patches set different keys on the same tab
- **THEN** the saved state contains both changes.

#### Scenario: Rejected patch
- **WHEN** the tab is not open on that agent or the resulting JSON string exceeds 64,000 UTF-16 code units
- **THEN** the patch fails without saving the proposed state.

<!-- id: canvas.setState.merge -->
<!-- entities: tab, state patch -->
<!-- enforced: src/canvas/setState.ts (canvas.setState); src/canvas/locked.ts (canvas.locked) -->
<!-- test: src/canvas/canvas.test.ts:105 -->

### Requirement: Close without hiding the Canvas
Closing an open tab SHALL move it to closed history without changing Canvas visibility or disturbing the selection of another active tab.

#### Scenario: Close the active tab
- **WHEN** the active tab closes
- **THEN** the next tab in strip order becomes active, or the preceding tab if there is no next tab, or none if the strip is empty.

#### Scenario: History cleanup
- **WHEN** a tab closes successfully
- **THEN** that agent's tabs closed more than 30 days earlier are deleted; a close targeting no open tab instead reports `closed: false`.

<!-- id: canvas.close.closed-at -->
<!-- entities: agent, tab, closed history -->
<!-- enforced: src/canvas/close.ts (canvas.close) -->
<!-- test: src/canvas/canvas.test.ts:57; src/canvas/canvas.test.ts:193 -->

### Requirement: List open tabs separately from history
The default list SHALL return only the agent's open tabs in strip order, marking the selected tab active. A closed list SHALL instead return inactive history entries, most recently closed first.

#### Scenario: History limit
- **WHEN** closed history is requested without a limit
- **THEN** at most 20 entries are returned; a requested limit above 200 returns at most 200.

<!-- id: canvas.list.closed -->
<!-- entities: agent, open tabs, closed history -->
<!-- enforced: src/canvas/list.ts (canvas.list) -->
<!-- test: src/canvas/canvas.test.ts:193 -->

### Requirement: Reopen by ID
Reopening a retained tab by ID SHALL open its agent's Canvas and select the same tab with its saved arguments and state.

#### Scenario: Restore or switch
- **WHEN** the ID belongs to a closed tab on that agent
- **THEN** the tab returns first in strip order; reopening an already open tab selects it without moving it.

#### Scenario: Unknown ID
- **WHEN** the agent has no tab with the supplied ID
- **THEN** reopen fails rather than creating a tab.

<!-- id: canvas.reopen.closed-at -->
<!-- entities: agent, tab, state -->
<!-- enforced: src/canvas/reopen.ts (canvas.reopen) -->
<!-- test: src/canvas/canvas.test.ts:193 -->

### Requirement: Render only the requested item
The item document SHALL render only an open tab of the requested agent with an available kind, returning 404 otherwise.

#### Scenario: Panel versus full document
- **WHEN** a renderable item document is requested with the fragment parameter
- **THEN** the response contains the item's panel without the document shell; without the parameter it includes Canvas assets and a CSRF token. Both responses specify no-store and same-origin frame ancestors.

<!-- id: canvas.itemDocument.item -->
<!-- entities: agent, tab, item document -->
<!-- enforced: src/canvas/itemDocument.ts (canvas.itemDocument) -->
<!-- test: src/canvas/itemDocument.test.ts (item lookup cannot cross agent boundary; fragment is restricted to requested item and does not include document assets; isolated document carries assets/token without a layout or application shell) -->

### Requirement: Sandbox HTML frame responses
HTML frame responses SHALL carry a sandboxing content security policy without same-origin permission, independently of the supplied HTML.

#### Scenario: Load the HTML frame directly
- **WHEN** an open HTML tab's frame is requested
- **THEN** the response permits scripts within the sandbox, sets `connect-src 'none'`, limits images to data and blob URLs, and supplies the state bridge before the tab's HTML.

#### Scenario: Wrong frame target
- **WHEN** the ID is not an open HTML tab on the requested agent
- **THEN** the frame returns 404 with the same sandbox policy.

<!-- id: canvas.htmlFrame.csp -->
<!-- kind: invariant -->
<!-- entities: HTML tab, frame response -->
<!-- enforced: src/canvas/htmlFrame.ts (CSP, canvas.htmlFrame) -->
<!-- test: src/canvas/canvas.test.ts:135 -->

<!-- uncertainty: No timed purge independent of close is asserted. The inspected tests do not establish the exact state-size or retention cutoffs. -->
<!-- deferred: src/canvas/navigationSecurity.test.ts and frontend/src/hooks/useCanvas.test.tsx cover navigation authorization and client synchronization rather than tab storage or frame response semantics. -->
