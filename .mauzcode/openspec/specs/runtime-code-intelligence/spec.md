# Runtime code intelligence

## Purpose
Describe what the runtime source index can tell a reader about dependencies, test reachability, quality findings and architecture without executing the indexed code.

<!-- Last verified: d35de7c2, 2026-11-22; source inspection only. -->

## Requirements

### Requirement: Preview index counts
A dry run of the indexer SHALL report the computed call count without persisting the new call edges.

#### Scenario: Preview a project with one call
- **WHEN** a dry run scans two functions with one static call between them against an empty call index
- **THEN** it reports one call and the call index remains empty

<!-- id: code-index-dry-run -->
<!-- entities: function, call edge -->
<!-- enforced: src/code/index.ts:243 -->
<!-- test: src/code/index.test.ts :: dryRun computes counts and writes nothing -->

### Requirement: Trace incoming call sites
Caller lookup SHALL report incoming sites up to the requested depth, with their source locations, minimum depths and entry-point flags.

#### Scenario: Trace a dependency back to a route
- **WHEN** a route calls a function which calls a second function which calls the target, and the lookup allows three levels
- **THEN** the direct site has depth one and the route site has depth three and is marked as an entry point

<!-- id: code-callers-up -->
<!-- entities: caller, call site, entry point -->
<!-- enforced: src/code/callers.ts :: default export (recursive up query) -->
<!-- test: src/code/callers.test.ts :: direct callers with file and line; depth walks back to the entry point -->

### Requirement: Retrieve a function slice
A slice SHALL distinguish a missing function from an indexed function and return the latter's incoming sites and outgoing dependencies without requiring source text in the response.

#### Scenario: Request context without source
- **WHEN** an indexed function with callers and a callee is requested with includeSource set to false
- **THEN** its slice reports found, lists callers and the callee, and supplies no source text

#### Scenario: No index match
- **WHEN** neither an indexed name nor a relative path matches the request
- **THEN** the slice reports found as false with empty calls, callers and types

<!-- id: code-slice-self -->
<!-- entities: function, slice -->
<!-- enforced: src/code/slice.ts :: default export -->
<!-- test: src/code/callers.test.ts :: returns what it calls, who calls it, and optionally its source -->

### Requirement: Classify static test reachability
Coverage SHALL distinguish direct test calls, functions reached indirectly within the traversal depth, and functions not reached. A sibling test file alone SHALL NOT count as a call.

#### Scenario: Test reaches a helper through another function
- **WHEN** a test calls an outer function that calls a helper within the traversal depth, and no test calls the helper directly
- **THEN** the outer function is direct and the helper is indirect

<!-- id: code-coverage-reached -->
<!-- entities: test, function, coverage status -->
<!-- enforced: src/code/coverage.ts:85 -->
<!-- test: src/code/coverage.test.ts :: a function reached only through another is indirect, not none -->
<!-- test: src/code/coverage.test.ts :: a sibling test file alone proves nothing -->

### Requirement: Evaluate selected findings
The quality report SHALL compute its ok flag from the severity-filtered findings before limiting the returned list. Warnings alone SHALL NOT make the report fail.

#### Scenario: A report contains only warnings
- **WHEN** the selected checks report an uncalled function as a warning and no errors
- **THEN** the report is ok

<!-- id: code-quality-picked -->
<!-- entities: finding, severity, report -->
<!-- enforced: src/code/quality.ts:214-227 -->
<!-- test: src/code/quality.test.ts :: an uncalled function is a warning, and the codebase stays ok -->

### Requirement: Aggregate module dependencies
The architecture graph SHALL weight each directed module pair by its eligible indexed call sites, excluding same-module and discarded calls and, by default, test edges.

#### Scenario: Retain repeated dependencies
- **WHEN** two eligible sites call from module A to module B and a third calls within A, with minimum weight two and both modules within the node limit
- **THEN** the graph returns an A-to-B edge of weight two and no A-to-A edge

<!-- id: architecture-map-graph-edge-map -->
<!-- entities: module, dependency, call site -->
<!-- enforced: plugins/architecture-map/src/architectureMap/graph.ts:28-41 -->

### Requirement: Classify file turbulence
Turbulence SHALL classify eligible files using their total cyclomatic complexity and commit count relative to the lower medians of the eligible files, before limiting the ranked list.

#### Scenario: Distinguish high churn from high commit count
- **WHEN** a file exceeds the complexity median but equals the commit-count median, even if many lines changed
- **THEN** its quadrant is cowboy rather than danger

<!-- id: architecture-map-turbulence-median -->
<!-- entities: indexed file, commit count, quadrant -->
<!-- enforced: plugins/architecture-map/src/architectureMap/turbulence.ts :: default export (median, highC, highH) -->

<!-- uncertainty: plugins/architecture-map/src/architectureMap/nativePages.mock.test.ts uses a stub graph; it does not verify aggregation or turbulence scoring. Static reachability is not execution coverage. -->
<!-- deferred: Database execution, project scanning and Git history collection are external inputs to these reports. -->
