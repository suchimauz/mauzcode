## Purpose

Let agents show a workspace file or directory to the person on their own canvas beside the chat through one typed native tool, with the same path resolution, deduplication and access rules as the canvas file kind.

## ADDED Requirements

### Requirement: Native artifact display
The system SHALL provide a native tool `show_artifact` that accepts a `path` and optional `title`, `host` and `mode` (`auto`, `preview` or `source`), opens that file or directory on the invoking agent's canvas as the active tab using the canvas `file` kind, and returns the tab id, title, absolute path and host. A relative path MUST resolve against the invoking agent's workspace.

#### Scenario: Show a report
- **WHEN** an agent calls `show_artifact` with `path` `report.md` that exists in its workspace
- **THEN** its canvas opens with an active `file` tab for the absolute path of `report.md`, and the tool returns that tab id

#### Scenario: Show the same file again
- **WHEN** an agent calls `show_artifact` twice with the same path
- **THEN** the canvas has one tab for that file and the second call returns the same tab id

#### Scenario: Missing file
- **WHEN** an agent calls `show_artifact` with a path that does not exist
- **THEN** the call fails and no tab is created

### Requirement: Artifact display bound to the invoking agent
`show_artifact` SHALL use only the canvas of the agent taken from the trusted invocation. Arguments MUST NOT select an agent or canvas owner; such arguments and any other unknown arguments MUST be rejected. A missing trusted invocation MUST fail instead of falling back to any current agent.

#### Scenario: Attempt to target another canvas
- **WHEN** an agent passes `agentId` to `show_artifact`
- **THEN** the call is rejected as an unknown argument and no canvas changes

### Requirement: File kind only
`show_artifact` SHALL open only the canvas `file` kind. It MUST NOT accept a canvas kind, HTML body or URL.

#### Scenario: Attempt to show HTML
- **WHEN** an agent passes `kind` or `html` to `show_artifact`
- **THEN** the call is rejected as an unknown argument

### Requirement: Artifact display gating
`show_artifact` SHALL be advertised and executable only when the invoking agent's preset allows the adapter, `canvas.show` and `files.embedUrl`. Denying the adapter MUST leave `canvas.show` reachable through evaluation when the preset allows it.

#### Scenario: Canvas denied
- **WHEN** an agent's preset denies `canvas.show`
- **THEN** `show_artifact` is absent from its tool list and a direct call is rejected

### Requirement: Canvas guidance names the native tool
When the agent can call `show_artifact`, the Canvas prompt section SHALL direct it to that tool for showing files, and MUST keep `canvas.show` guidance for other kinds.

#### Scenario: Tool available
- **WHEN** the system prompt is built for an agent that can call `show_artifact`
- **THEN** the Canvas section names `show_artifact` for files and still describes `canvas.show` for other kinds
