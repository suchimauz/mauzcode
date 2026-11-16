# project-check-integrity Specification

## Purpose
Make project-wide verification trustworthy by preserving complete failure evidence, distinguishing proven change attribution from hypotheses, and requiring explicit approval for optional-plugin removal.

## Requirements

### Requirement: Complete failure accounting
The verification report SHALL account for every failing test and every full-project type diagnostic in its recorded baseline, retaining raw logs and mapping each item to a repair disposition. Grouping MUST preserve individual item identities and reconcile totals.

#### Scenario: Baseline contains multiple failure classes
- **WHEN** the fast suite and full typecheck produce failures
- **THEN** the report records commands, exit codes, revision and environment when available, raw evidence paths, individual failures, grouped counts, and unresolved items
- **AND** missing historical metadata is explicitly marked unknown rather than reconstructed as fact

### Requirement: Evidence-qualified change attribution
Every failure attribution SHALL be marked confirmed, candidate, or unattributed. A confirmed causal attribution MUST include reproducible comparative or direct code-path evidence. Shared file scope, dates, and absent diagnostics in changed files alone MUST NOT establish causality.

#### Scenario: A failure overlaps a historical change
- **WHEN** a failure concerns a contract modified by an archived change but causal evidence is absent
- **THEN** the report links the exact change and relevant contract as a candidate and states the evidence still required

### Requirement: Honest acceptance checks
A repair batch SHALL pass the complete declared fast suite and full project typecheck before being reported green. New skips, narrowed check coverage, weakened assertions, or blanket type suppression MUST NOT be used to conceal baseline failures. Subsequent source edits invalidate previous acceptance results.

#### Scenario: Focused checks pass but project checks fail
- **WHEN** targeted checks pass and a complete project check still fails
- **THEN** the batch remains incomplete and the remaining failures stay visible in the ledger

### Requirement: Explicit optional-plugin disposition
Optional-plugin removal SHALL require owner confirmation of an exact plugin list and dependency impact. Retained plugins and private integrations in declared check scope MUST be repaired or remain explicitly unresolved; being optional does not authorize removal or exclusion.

#### Scenario: Owner says some plugins are unnecessary
- **WHEN** no exact removal list has been approved
- **THEN** investigation inventories candidates and their dependencies without deleting, disabling, or excluding them

### Requirement: Isolated reproducible verification
Automated repairs SHALL use disposable test resources and mocked model inference, preserve complete diagnostics, and designate one owner for each whole-project verification batch. Working databases, real provider accounts, and runtime secrets MUST NOT serve as test fixtures.

#### Scenario: A missing legacy table appears in a proxy test
- **WHEN** a test accesses a retired schema object
- **THEN** the repair reconciles the test with the current schema in isolated test storage rather than recreating legacy objects in the working database
