# Proposal

## Why

A skill publication currently changes the bootstrap before the entire conversation. Agents need to discover new skills without repeatedly paying for the same catalogue or invalidating an otherwise reusable prefix.

## What Changes

- Keep usage guidance static. Deliver authorized catalogue metadata once, then append only additions and advertised metadata edits within the remaining window budget.
- Keep ordinary disappearances silent. Live policy, not earlier advertisements, determines access. Instructions and resources remain on demand.
- Rebuild discovery after compaction without rewriting history or waking idle conversations.

## Capabilities

### New Capabilities
- `agent-skill-context`: bounded, append-only skill discovery in the effective conversation window.

### Modified Capabilities
None.

## Impact

Changes skill prompt assembly and per-window context delivery. Depends on the Skills substrate in `add-project-skills`. No changes to permissions, read APIs, package format, publication, Skills menu, provider APIs or other mutable prompt sections. Existing conversations may see one bootstrap transition.
