# Browser sidebar tab binding

## Purpose

Describe how a Chrome tab opts into the sidebar, obtains approval and keeps its own draft or chat across panel visits.

<!-- Last verified: 2026-11-22 at d35de7c2; source and test inspection only. -->

## Requirements

### Requirement: Explicit per-tab opt-in
The extension SHALL enable the sidebar for the clicked tab without enabling untouched tabs, and restore that opt-in after a service worker restart in the same browser session.

#### Scenario: Return to an opted-in tab
- **WHEN** the user opens the sidebar from the toolbar, visits another untouched tab and returns
- **THEN** the first tab retains its sidebar identity and the other tab remains disabled.

#### Scenario: Replace a tab
- **WHEN** Chrome replaces an opted-in tab
- **THEN** the replacement inherits neither the opt-in nor the bound chat.

<!-- id: worker.onClicked.tab-opt-in -->
<!-- entities: tab, sidebar, browser session -->
<!-- enforced: browser-extension/worker.js (chrome.action.onClicked, boot, chrome.tabs.onReplaced) -->
<!-- test: browser-extension/worker.test.js :: action enables only clicked tab, returning preserves its identity and worker restart restores opt-in -->
<!-- test: browser-extension/worker.test.js :: replacement never inherits opt-in or chat; removed opted-in record is deleted -->

### Requirement: Explicit pairing approval
The bridge SHALL reject binding requests from a pending pair until approval. Viewing the approval page SHALL NOT approve the pair.

#### Scenario: Pending credential
- **WHEN** the extension requests pairing and then tries to bind with its pending credential
- **THEN** it receives an approval URL from pairing and a 403 from binding.

#### Scenario: Approve the extension
- **WHEN** a user meeting the instance login policy submits the valid pending pair's same-origin approval form with its nonce and affirmative choice
- **THEN** approval sets a 30-day expiry; a visitor who needs to sign in is redirected to login instead.

<!-- id: sidebar.bridge.pair-not-approved -->
<!-- entities: extension, pair, approval form -->
<!-- enforced: src/sidebar/bridge.ts (sidebar.bridge, pair_not_approved); src/sidebar/approval.ts (sidebar.approval) -->
<!-- test: src/sidebar/approval.test.ts :: approval requires existing MauzCode session when password configured -->

### Requirement: Bind the exact browser target
The bridge SHALL associate a pair, browser epoch and tab ID with an exact page target and browser instance rather than matching by URL.

#### Scenario: Reopen an empty binding
- **WHEN** the extension binds and refreshes the same live page before a chat is attached
- **THEN** the bridge returns the same binding's draft without creating a chat.

#### Scenario: Browser identity changes
- **WHEN** a context refresh finds the same target ID in a different browser instance
- **THEN** the bridge revokes the old binding and returns 409 instead of moving the chat.

<!-- id: sidebar.bridge.target-identity -->
<!-- entities: binding, target, browser instance -->
<!-- enforced: src/sidebar/bridge.ts (sidebar.bridge, browser_restarted); src/sidebar/targetSnapshot.ts (sidebar.targetSnapshot) -->
<!-- test: src/sidebar/draft.test.ts :: draft bind/context/reopen creates nothing; concurrent first submit binds once before enqueue with current title/default -->

### Requirement: Attach or detach an existing chat
A draft SHALL accept an existing non-archived chat only if it has no active binding. Detaching SHALL return the tab to a draft with the same binding ID.

#### Scenario: Chat already in use
- **WHEN** a draft attempts to attach a chat actively bound elsewhere
- **THEN** the draft returns 409 without taking the chat from the other tab.

#### Scenario: Detach from the same live target
- **WHEN** the extension detaches the chat from its active binding
- **THEN** the bridge returns a draft URL for that binding and no agent ID.

<!-- id: sidebar.draft.attach -->
<!-- entities: draft, chat, binding -->
<!-- enforced: src/sidebar/draft.ts (sidebar.draft, attach); src/sidebar/bridge.ts (sidebar.bridge, detach) -->

### Requirement: Submit a draft once
The first successful draft submission SHALL create one chat using the current page title and default model, bind it before message submission and reuse the result on retries.

#### Scenario: Concurrent first messages
- **WHEN** two submissions race for the same draft and the winning submission succeeds
- **THEN** only one chat is created and only one first message is sent; retrying the completed draft identifies that chat.

#### Scenario: Empty submission
- **WHEN** the first message contains neither nonblank text nor a nonempty file
- **THEN** the draft returns 400 without claiming the submission.

<!-- id: sidebar.draft.first-send-claim -->
<!-- entities: draft, chat, first message -->
<!-- enforced: src/sidebar/draft.ts (sidebar.draft, claim) -->
<!-- test: src/sidebar/draftApi.test.ts :: React draft concurrent first submissions create and send once; retries reuse result -->
<!-- test: src/sidebar/draft.test.ts :: draft bind/context/reopen creates nothing; concurrent first submit binds once before enqueue with current title/default -->

### Requirement: Keep the panel tied to the current binding
The panel SHALL preserve the mounted draft frame when its binding gains a chat, and clear both the frame and open link when notified that its identity has closed or been revoked.

#### Scenario: Binding gains an agent
- **WHEN** the mounted draft receives refreshed context with the same binding ID and a new agent ID
- **THEN** the open link targets the chat without remounting the frame.

#### Scenario: Late response after closure
- **WHEN** an open response arrives after the panel has processed invalidation for that identity
- **THEN** the stale response does not restore the frame or link.

<!-- id: panel.render.binding-identity -->
<!-- entities: panel, frame, binding, open link -->
<!-- enforced: browser-extension/panel.js (render, clearFrame, connect) -->
<!-- test: browser-extension/panel.test.js :: draft frame survives binding-to-agent context refresh without remount -->
<!-- test: browser-extension/panel.test.js :: close/revoke invalidation unloads frame and link, and ignores stale responses -->

<!-- uncertainty: Browser restart detection and attach/detach conflicts were inspected in code; no live Chrome or database checks were performed. -->
<!-- deferred: src/sidebar/requestOrigin.ts (transport policy); browser-extension/helpers.js (URL construction). -->
