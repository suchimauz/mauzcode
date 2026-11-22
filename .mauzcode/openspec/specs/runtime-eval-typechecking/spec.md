# Runtime eval typechecking

## Purpose
Describe when an eval body is checked before it runs, how callers locate errors in the submitted source, and what happens when tsgo cannot check it.

<!-- Last verified: d35de7c2, 2026-11-22; static source inspection. -->

## Requirements

### Requirement: Reject a body before its first side effect
When checking is enabled and the checker returns errors, core eval SHALL throw a TypeError containing the diagnostics without executing any part of the body.

#### Scenario: Invalid call follows a valid statement
- **WHEN** a checked body increments a counter and then passes a number where a runtime function expects a string
- **THEN** eval reports `eval: typecheck failed:` with the type mismatch and the counter remains unchanged.

<!-- id: procs.repl.eval.checked-not-ok -->
<!-- entities: eval body, diagnostics -->
<!-- enforced: src/procs/repl/eval.ts#default (if !checked.ok) -->
<!-- test: src/procs/repl/eval.test.ts :: eval: typecheck rejects invalid ctx.fns arguments before execution -->

### Requirement: Select checking per eval call
Core eval SHALL use the explicit boolean `typecheck` option in preference to global `repl.typecheckEval` and skip checking only when the resulting value is false.

#### Scenario: Global setting disables checking
- **WHEN** the global setting is false and a caller omits the option for a body that assigns a string to a number-annotated variable and returns it
- **THEN** eval returns the string.

#### Scenario: Caller disables checking
- **WHEN** the caller sets `typecheck: false` for the same body
- **THEN** eval returns the string without requiring a global setting change.

<!-- id: procs.repl.eval.typecheck-selection -->
<!-- entities: eval options, global setting -->
<!-- enforced: src/procs/repl/eval.ts#default (typecheck !== false) -->
<!-- test: src/procs/repl/eval.test.ts :: eval: declared setting can disable typecheck globally -->
<!-- test: src/procs/repl/eval.test.ts :: eval: typecheck can be disabled per call -->

### Requirement: Check against runtime declarations
The tsgo checker SHALL check the body against project function signatures and type a supplied `agent` binding as `types.agent.Agent`.

#### Scenario: Runtime names resolve in the virtual body
- **WHEN** a caller checks `return agent.id.toUpperCase()` with an agent binding and separately checks a call to a nonexistent workspace function
- **THEN** the first check succeeds and the second reports the missing property.

<!-- id: tsgo.check.binding-params -->
<!-- entities: eval body, agent binding, project declarations -->
<!-- enforced: src/tsgo/check.ts#default (bindingParams, params) -->
<!-- test: src/tsgo/tsgo.it.test.ts :: sees project types, ctx.fns signatures and bindings -->

### Requirement: Locate and filter tsgo diagnostics
The tsgo checker SHALL return error-severity diagnostics with one-based body-relative positions and report only errors with numeric codes 1000 through 1999 when any such errors are present.

#### Scenario: Error on the second source line
- **WHEN** a blank first line precedes `const x: number = 'a';` on the second line
- **THEN** the assignment diagnostic starts with `2:7`, excluding the virtual function header.

#### Scenario: Incomplete expression
- **WHEN** the body is `return (`
- **THEN** the errors contain only `2:1 Expression expected.`

<!-- id: tsgo.check.syntax-filter -->
<!-- entities: diagnostic severity, source position -->
<!-- enforced: src/tsgo/check.ts#default (syntax, errors) -->
<!-- test: src/tsgo/tsgo.it.test.ts :: finds type errors with lines relative to the eval body -->
<!-- test: src/tsgo/tsgo.it.test.ts :: reports syntax errors and only error-severity diagnostics -->

### Requirement: Keep checking when tsgo is unavailable
The REPL checker SHALL return tsgo's verdict when its enabled check completes and use the in-process checker when tsgo checking is disabled, absent, or throws.

#### Scenario: Disable the engine rather than the eval check
- **WHEN** global `tsgo.enabled` is false and the REPL checker receives a body with a type mismatch
- **THEN** it reports `engine: "tsserver"` and a failed check.

#### Scenario: Enabled tsgo check throws
- **WHEN** the attempted tsgo check throws instead of returning diagnostics
- **THEN** the REPL checker increments the fallback count and attempts the in-process check for the same body and bindings.

<!-- id: procs.repl.typecheck.engine-selection -->
<!-- entities: tsgo, in-process checker, fallback count -->
<!-- enforced: src/procs/repl/typecheck.ts#default (tsgo.check, inProcess) -->
<!-- test: src/tsgo/tsgo.it.test.ts :: procs.repl.typecheck uses tsgo and falls back to the in-process service when disabled -->

<!-- uncertainty: The named fallback test covers the disabled setting, not a missing binary or a thrown check during eval. Tests were inspected, not executed. -->
<!-- deferred: src/repl/diagnoseParse.ts handles parse hints rather than selecting a checker; src/tsgo/server.ts and src/tsgo/status.ts expose lifecycle and status outside the eval verdict. -->
