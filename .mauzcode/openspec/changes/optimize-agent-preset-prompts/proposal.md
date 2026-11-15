# Proposal

## Why
Agent preset prompts repeat reference material and project-specific rules, consuming context while some examples advertise unavailable capabilities. The historical paragraph-equivalence rule also prevents deliberate, reviewed shortening even when safety and behavior are preserved.

## What Changes
- Shorten persistent guidance using existing runtime/plugin discovery and documentation, not a new instruction loader.
- Filter independent capability examples by effective access, including custom denies and inherited snapshot intersections; keep Minimal self-contained and API-free.
- Separate MauzCode host-runtime facts from target-project policies; place the server-cwd warning with evaluation/workspace guidance and clarify the scope of the runtime code index.
- Consolidate duplicated project policies and reference material in AGENTS.md and topical documentation, preserving an accessible authoring route outside the MauzCode repository.
- Replace historical paragraph preservation with immutable historical evidence, current invariant tests and a reviewed optimization record.
- Measure assembled text, generated sections and native schemas separately against a reproducible baseline; aim for 25–35% shorter Standard/Creator prompts without weakening guarantees.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `agent-presets`: Refine capability-conditioned prompt guidance and project-policy scope; allow reviewed prompt compression while retaining exclusion semantics, safety and historical evidence.

## Impact
Affected areas are agent base/capability prompt files, full-system-prompt assembly, relevant tools/input/canvas/plugins guidance generators, prompt tests/fixtures, AGENTS.md and agent-presets/architecture/authoring documentation. Access rules, plugin grants, persisted presets, immutable snapshots, authorization, and user prompt additions remain unchanged. Full Canvas/Input schema and plugin-catalog redesign, a new instruction-pack infrastructure, automatic commits, publication and archiving are out of scope.
