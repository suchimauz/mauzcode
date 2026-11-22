# Browser push notification delivery

## Purpose
Notify an agent's owner when input is needed or work stops with an error, without sending form contents or notifying devices about a chat the owner has already seen.

Last verified: 2026-11-22 at `d35de7c2`. Source files are identified below.

## Requirements

### Requirement: Browser login and device discovery
Device operations SHALL require an active account and an unexpired cookie binding for that account. Configuration SHALL list only the owner's unexpired devices on HTTPS.

#### Scenario: Inspect devices across logins
- **WHEN** the authenticated owner requests HTTPS configuration
- **THEN** each device is identified by ID and endpoint hash, not by endpoint or encryption keys; a current-login marker distinguishes this binding from the owner's other bindings.

#### Scenario: Unavailable push configuration
- **WHEN** a bound owner requests configuration over a non-HTTPS public origin
- **THEN** push is disabled, the public key is null and the device list is empty.

#### Scenario: Cookie rotation
- **WHEN** an OIDC cookie rotates for the same unrevoked login
- **THEN** the push binding stays the same and uses the durable login expiry.

<!-- id: web-push-handle-config -->
<!-- entities: login, device, owner -->
<!-- enforced: src/webPush/handle.ts (webPush.handle); src/webPush/sessionBinding.ts (webPush.sessionBinding) -->
<!-- test: src/webPush/backend.unit.test.ts: config exposes device hashes and public key only -->
<!-- test: src/webPush/sessionBinding.unit.test.ts: OIDC push identity survives cookie rotation and uses durable session expiry -->

### Requirement: Session-bound subscription changes
Subscription changes SHALL require matching HTTPS origin and valid CSRF proof. A registered endpoint SHALL NOT be reassigned to another owner or login.

#### Scenario: Register or refresh a device
- **WHEN** a valid subscribe request arrives after expired devices for the owner have been removed
- **THEN** the same binding can refresh its endpoint; another binding's endpoint or a new endpoint beyond ten devices returns 409.

#### Scenario: Remove a device
- **WHEN** the owner unsubscribes by endpoint or by device ID
- **THEN** endpoint removal is limited to the current login, whereas ID removal can retire a device from any of that owner's logins.

<!-- id: web-push-handle-subscription -->
<!-- entities: endpoint, login, subscription -->
<!-- enforced: src/webPush/handle.ts (webPush.handle) -->
<!-- test: src/webPush/backend.unit.test.ts: foreign ownership and concurrent endpoint conflicts reject, never rebind -->
<!-- test: src/webPush/backend.unit.test.ts: unsubscribe by subscription id is owner scoped across sessions -->

### Requirement: Owner-specific category choices
Input and error notifications SHALL default on independently for an active owner's unarchived, top-level navigation agent. Ineligible agents SHALL have neither category enabled.

#### Scenario: Save only the error category
- **WHEN** the bound owner submits a valid same-origin preference form for an eligible agent with error checked and input absent
- **THEN** input is disabled and error remains enabled for that owner and agent.

<!-- id: web-push-preferences-eligibility -->
<!-- entities: owner, agent, preference -->
<!-- enforced: src/webPush/preferences.ts (webPush.preferences); src/webPush/savePreferences.ts (webPush.savePreferences) -->
<!-- test: src/webPush/preferences.unit.test.ts: missing preference defaults both on, owner and main eligibility enforced in SQL -->
<!-- test: src/webPush/preferences.unit.test.ts: save derives owner server-side and writes unchecked flags false -->

### Requirement: Outstanding input delivery
Input delivery SHALL require an open input, an owner-matching caller, an enabled input category and a new delivery claim for the input and subscription.

#### Scenario: A device has already been claimed
- **WHEN** the input hook runs again for an already claimed device
- **THEN** no second provider request is made, even if the earlier attempt timed out.

#### Scenario: First eligible delivery
- **WHEN** a validated active device wins its first claim for an unsuppressed input
- **THEN** the push identifies the input by tag and carries the chat URL and project and agent labels, not the form contents.

<!-- id: web-push-notify-input-claim -->
<!-- entities: input, subscription, delivery -->
<!-- enforced: src/webPush/notifyInput.ts (webPush.notifyInput) -->
<!-- test: src/webPush/backend.unit.test.ts: background agent input sends once; no unsafe redirect or plaintext content -->
<!-- test: src/webPush/backend.unit.test.ts: foreign owner and unauthenticated invocation never send -->

### Requirement: Terminal error delivery
Error delivery SHALL require a matching durable failure that still describes the agent's current idle, unscheduled, non-user-stopped state, an enabled error category and a new claim per run and subscription.

#### Scenario: Competing failure dispatches
- **WHEN** two dispatches target the same eligible failed run and device
- **THEN** only the winner may attempt a push, tagged with the run token and carrying chat identity rather than exception details.

#### Scenario: Provider retires a device
- **WHEN** the provider returns 404 or 410 for an input or error notification
- **THEN** the subscription is removed instead of retrying the push.

<!-- id: web-push-notify-error-claim -->
<!-- entities: failed run, subscription, delivery -->
<!-- enforced: src/webPush/notifyError.ts (webPush.notifyError); src/webPush/notifyInput.ts (webPush.notifyInput) -->
<!-- test: src/webPush/error.unit.test.ts: error delivery claims concurrently once per durable run and subscription, with owner and state fences -->
<!-- test: src/webPush/error.unit.test.ts: error provider 410 revokes subscription -->

### Requirement: Suppression across devices
Before selecting devices, dispatch SHALL suppress the event if the owner is present in the chat or has a positive read watermark at or after the event time.

#### Scenario: An owner has already left the chat
- **WHEN** no presence is reported but the owner's chat receipt equals the input creation or failure timestamp
- **THEN** no device is selected for that event. Another viewer's receipt does not suppress it.

<!-- id: web-push-should-skip-watermark -->
<!-- entities: owner, chat, read watermark -->
<!-- enforced: src/webPush/shouldSkip.ts (webPush.shouldSkip); src/webPush/notifyInput.ts (webPush.notifyInput); src/webPush/notifyError.ts (webPush.notifyError) -->
<!-- test: src/webPush/backend.unit.test.ts: suppression reads presence and the durable read receipt of the owner -->

### Requirement: Recall after reading
Receipt processing SHALL select sent input and error events for the chat through the viewer's watermark only if a delivery belongs to a subscription of that viewer.

#### Scenario: Mark events after attempting withdrawal
- **WHEN** matching sent events are found
- **THEN** recall is attempted per input or failed run and its remaining sent delivery records are marked recalled, even if the recall call rejects; later receipts do not select those records again.

<!-- id: web-push-recall-seen-deliveries -->
<!-- entities: viewer, read watermark, delivery -->
<!-- enforced: src/webPush/recallSeen.ts (webPush.recallSeen) -->
<!-- test: src/webPush/recallSeen.unit.test.ts: viewing the chat recalls delivered input and error notifications once -->

### Requirement: Browser notification handling
The service worker SHALL display input and error notifications only for validated chat paths, use category-specific fixed body text, and handle recall without showing a new notification.

#### Scenario: Display a legacy input
- **WHEN** a payload has a valid chat path and omits its type
- **THEN** the worker displays an input notification using sanitized project and agent labels of at most 80 characters each, or MauzCode if both are empty; supplied body text is ignored.

#### Scenario: Withdraw by tag
- **WHEN** a recall names a valid input or error tag
- **THEN** the worker closes only notifications with that exact tag.

#### Scenario: Follow a notification
- **WHEN** a notification is clicked
- **THEN** it closes; for a same-origin chat URL without query or fragment the worker focuses an exact matching window or opens the chat. Other destinations are not opened.

<!-- id: web-push-worker-source-notification -->
<!-- entities: service worker, notification, chat window -->
<!-- enforced: src/webPush/workerSource.ts (webPush.workerSource) -->
<!-- test: src/webPush/workerSource.test.ts: typed error has fixed safe body; unknown categories rejected and legacy input retained -->
<!-- test: src/webPush/workerSource.test.ts: recall push closes only the notification it names and shows nothing -->
<!-- test: src/webPush/workerSource.test.ts: worker focuses matching chat or opens safe chat, rejects cross-origin and non-chat click data -->

<!-- deferred: src/webPush/validateSubscription.ts; src/webPush/vapid.ts; src/webPush/recall.ts; src/webPush/recallError.ts; src/webPush/recallStaleError.ts -->
<!-- uncertainty: Provider acceptance and a recall attempt do not establish display or withdrawal on a real device. Tests were inspected, not executed. -->
