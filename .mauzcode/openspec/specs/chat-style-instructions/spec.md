# Chat reply-style instructions

## Purpose
Describe how a chat selects a reply-style instruction and when that instruction becomes part of the model's conversation history.

Last verified: 2026-11-22 at `d35de7c2` by inspection of clean source and test files.

## Requirements

### Requirement: Change chat settings
The status action SHALL accept only an owner-authorized, CSRF-checked JSON update with a supported mode, text of at most 500 UTF-16 code units and an integer cadence from 1 through 100.

#### Scenario: Reject an unexpected field
- **WHEN** an otherwise valid status update includes an extra field
- **THEN** the endpoint returns 400 without applying the instruction.

<!-- id: meta-surface-status -->
<!-- entities: chat, status update -->
<!-- enforced: src/agent/$route_$id_meta-settings_POST.ts default export; src/agent/metaSurface.ts default export, status action -->
<!-- test: src/agent/metaSurface.test.ts :: validates field allowlist and applies exact setting -->

### Requirement: Store chat overrides
The setter SHALL trim text before limiting it to 500 UTF-16 code units, floor and clamp the cadence to 1–100, and default omitted cadence and mode to 1 and custom respectively.

#### Scenario: Save an override without a cadence
- **WHEN** the setter receives `  Be brief  ` for an unarchived chat with no cadence or mode
- **THEN** it stores and returns `Be brief`, 1 and custom, and updates the live chat if loaded.

#### Scenario: No eligible chat
- **WHEN** the target is missing or archived
- **THEN** the setter raises an agent-not-found error.

<!-- id: set-status-line-update -->
<!-- entities: chat, override -->
<!-- enforced: src/agent/setStatusLine.ts default export -->

### Requirement: Select instruction text
The resolver SHALL use the current global setting in global or unspecified mode, only the chat text in custom mode, and no instruction in off mode. Blank selected text SHALL yield no instruction.

#### Scenario: Inherit or disable
- **WHEN** a chat inherits a nonblank global line on a positive counted turn and then switches off
- **THEN** resolution changes from the prefixed global line to an empty string.

#### Scenario: Clear custom text
- **WHEN** custom text is whitespace and the global instruction is nonblank
- **THEN** the resolver returns an empty string rather than falling back to global.

<!-- id: status-line-for-turn-mode -->
<!-- entities: global instruction, chat override -->
<!-- enforced: src/agent/statusLineForTurn.ts default export, userText; src/agent/$setting_globalStatusLine.ts default export -->
<!-- test: src/agent/statusLineForTurn.test.ts :: inherits the global line every turn and supports off -->

### Requirement: Count eligible user messages
A nonblank instruction SHALL resolve as `User status line: ` followed by the trimmed text only at positive multiples of the cadence, counting only this chat's non-cursor-excluded user messages. Global mode SHALL use cadence one.

#### Scenario: Every second user message
- **WHEN** custom cadence is two and one eligible user message has arrived
- **THEN** no instruction resolves until a second eligible message brings the count to two.

<!-- id: status-line-for-turn-count -->
<!-- entities: chat, user message, cadence -->
<!-- enforced: src/agent/statusLineForTurn.ts default export, turn modulo every -->
<!-- test: src/agent/statusLineForTurn.test.ts :: activates on configured user turns -->

### Requirement: Append the instruction to history
At run setup the system SHALL append a nonempty resolved line as a cursor-excluded user message of type `status_line` unless the transcript already ends with that type.

#### Scenario: Deliver a due instruction
- **WHEN** the resolved line is `User status line: Be brief` and the last message is an ordinary user message
- **THEN** the appended message contains `## Current status line`, a blank line, and `User status line: Be brief`, rather than adding the instruction to the request bootstrap.

#### Scenario: Retry at the same tail
- **WHEN** the line is due but the last message already has type `status_line`
- **THEN** no additional instruction row is appended.

<!-- id: run-active-status-line-tail -->
<!-- entities: transcript, model request -->
<!-- enforced: src/agent/run.ts default export, activeStatusLine tail check; src/agent/buildLlmRequest.ts default export, bootstrap -->

### Requirement: Clear turn-local state
Completing a prose or terminal HTML answer SHALL clear the active instruction from the run scratchpad without clearing the saved chat setting or retracting the instruction row.

#### Scenario: Complete a custom-instruction turn
- **WHEN** a run with an active custom instruction returns a completed prose answer
- **THEN** the scratchpad no longer holds the active line and the next run resolves the instruction again from the settings and count.

<!-- id: run-active-status-line-completion -->
<!-- entities: run scratchpad, chat setting -->
<!-- enforced: src/agent/run.ts:810 and src/agent/run.ts:969 -->

<!-- uncertainty: The cited tests cover selection, cadence and status update validation, not transcript insertion, retry suppression or cleanup across all run exits. No model compliance is guaranteed. -->
