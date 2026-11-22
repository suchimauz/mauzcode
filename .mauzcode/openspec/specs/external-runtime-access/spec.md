# External harness discovery and runtime access

## Purpose
Describe what local harnesses can discover and invoke, how evaluation authority differs from tool access, and what skill mounting changes on disk.

Last verified: 2026-11-22 at `d35de7c2`. Client: `script/mauzcode.ts`. Route and enforcement sources are listed below.

## Requirements

### Requirement: Harness admission
The ordinary gateway SHALL require a recognized loopback peer and verified external-harness authority and reject requests flagged as forwarded.

#### Scenario: Status denied
- **WHEN** authorization denies a status request
- **THEN** the route returns the denial instead of capability counts.

#### Scenario: Peer unknown or authority missing
- **WHEN** the peer address is unavailable or the request lacks the required verified authority
- **THEN** the gateway returns 403.

<!-- id: external-authorize-harness -->
<!-- kind: invariant -->
<!-- entities: external harness, gateway, peer -->
<!-- enforced: src/external/authorize.ts (external.authorize); src/external/$route_status_GET.ts (default export) -->
<!-- test: src/external/routes.test.ts — external status requires scoped authorization (status denial only) -->

### Requirement: Live capability discovery
The gateway SHALL expose capability counts, declared tool schemas, function listings or search results, and plugin search and detail results to authorized harnesses.

#### Scenario: Compare status and tool catalogue
- **WHEN** a client requests status and the tool catalogue against an unchanged runtime
- **THEN** status reports mounted plugin and declared tool counts; each catalogue entry identifies its wire name, key, module, description and parameters.

#### Scenario: Browse rather than search
- **WHEN** the function query is blank after trimming
- **THEN** the gateway lists metadata ordered by function name, with optional namespace filtering and a default limit of 50.

#### Scenario: Plugin detail unavailable
- **WHEN** the plugin detail lookup throws
- **THEN** the gateway returns 404 with an error rather than a workflow document.

<!-- id: external-route-tools-get-catalogue -->
<!-- entities: plugin, function metadata, tool catalogue -->
<!-- enforced: src/external/$route_status_GET.ts, src/external/$route_tools_GET.ts, src/external/$route_functions_GET.ts, src/external/$route_plugins_search_POST.ts, src/external/$route_plugins_$name_GET.ts (default exports) -->

### Requirement: Named tool dispatch
The tool route SHALL pass the requested name and decoded JSON arguments to the tool dispatcher rather than evaluate the request as code.

#### Scenario: Dispatcher accepts a call
- **WHEN** an authorized request supplies valid JSON and the dispatcher returns a non-error result
- **THEN** the route returns that result with status 200; a dispatcher error result instead receives status 400.

#### Scenario: Request rejected before dispatch
- **WHEN** the declared content length exceeds 256000 bytes or an otherwise admissible body is invalid JSON
- **THEN** the route returns 413 or 400 respectively without calling the dispatcher.

<!-- id: external-route-tools-name-call-post-dispatch -->
<!-- entities: named tool, arguments, dispatcher -->
<!-- enforced: src/external/$route_tools_$name_call_POST.ts (default export) -->
<!-- test: src/external/routes.test.ts — external tool route delegates only through tools.call (success path) -->

### Requirement: Separate evaluation authority
The evaluation route SHALL refuse production requests and otherwise require its own verified external-repl authority on a recognized loopback connection not flagged as forwarded.

#### Scenario: Ordinary authority is insufficient
- **WHEN** a client presents only ordinary harness authority or requests evaluation in production
- **THEN** evaluation is refused with 403 before code runs.

#### Scenario: Evaluation completes
- **WHEN** an admitted request within the declared length limit evaluates successfully
- **THEN** the response reports success, evaluator output and the returned value when present.

<!-- id: external-authorize-repl-evaluation -->
<!-- entities: evaluator, external harness, privileged authority -->
<!-- enforced: src/external/authorizeRepl.ts (external.authorizeRepl); src/external/$route_repl_POST.ts (default export) -->

### Requirement: Collision-safe skill mounting
Skill mounting SHALL link the runtime bridge and mounted plugins with skills into selected existing directories without replacing occupied destinations. A dry run SHALL report the proposed result without writing.

#### Scenario: Mount into a partially populated root
- **WHEN** a destination is absent, already links to the exact source path, or is otherwise occupied
- **THEN** mounting creates and reports a link, reports an existing link, or reports a collision respectively.

#### Scenario: Preview a mount
- **WHEN** mounting runs in dry-run mode
- **THEN** missing destinations are reported as linked without creating links or writing the bridge document; missing target directories are skipped.

<!-- id: external-mount-skills-destinations -->
<!-- entities: runtime bridge, plugin skill, target directory -->
<!-- enforced: src/external/mountSkills.ts (external.mountSkills); src/external/$route_skills_mount_POST.ts (default export) -->

<!-- uncertainty: The inspected route tests stub authorization and dispatch; they do not exercise credential verification, privileged evaluation, catalogue contents or mount filesystem effects. -->
<!-- deferred: src/external/$route_functions_$module_$name_GET.ts (individual function detail). -->
