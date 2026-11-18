# Proposal

## Why

A user can pause a persistent goal from chat but cannot remove it. Pausing leaves the goal attached to the agent.

## What Changes

Offer a clearly labelled removal action in the chat goal panel, with explicit confirmation and feedback when removal is unavailable. Reuse the existing server operation; removal neither stops an agent nor erases history.

## Capabilities

### New Capabilities
- `chat-goal-removal`: Safe removal of the current agent's persistent goal from the web chat.

### Modified Capabilities
None.

## Impact

Affects the React GoalDock, typed goal client and frontend tests. No API, storage, slash-command or agent-tool changes.
