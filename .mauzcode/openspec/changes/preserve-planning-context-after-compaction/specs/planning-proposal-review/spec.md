## ADDED Requirements

### Requirement: Stable collaboration guidance across compaction

When preparing a normal session request, the system SHALL use the latest collaboration guidance visible in the effective history for that request. If the current guidance is missing or outdated, the system SHALL persist it once at a safe transcript boundary so that unchanged guidance remains in the shared prefix of subsequent requests. Read-only previews SHALL NOT append transcript rows.

#### Scenario: A checkpoint drops the instruction
- **WHEN** compaction removes the last visible current-mode instruction but the original history still contains it
- **THEN** the next safe request restores the current instruction to durable history, and a subsequent request extends that prefix without another copy at the end

#### Scenario: Existing instruction is still visible
- **WHEN** the active checkpoint and retained tail, or full history selected by fallback, already expose the latest current instruction
- **THEN** preparing the request does not append another instruction

#### Scenario: Unsafe tool boundary or read-only preview
- **WHEN** the latest assistant tool call is awaiting its results, or a request is only being previewed
- **THEN** no collaboration instruction is written to the transcript during that operation
