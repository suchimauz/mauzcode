## Purpose

Make every native tool call in chat recognisable at a glance and fully inspectable on expand — a distinct icon, a human label and a meaningful one-line summary from a single declaration shared by core and plugin tools, identical for running and finished calls.

## ADDED Requirements

### Requirement: Declared tool presentation
A native tool declaration SHALL be able to include a presentation with a label, an icon identifier from a fixed documented allow-list, an optional category and an optional summary given as a template over arguments or a named built-in formatter. An unknown icon, category, formatter or a malformed presentation SHALL fall back to the default for that field and SHALL be reported as a loader warning without making the tool unavailable.

#### Scenario: Plugin tool declares presentation
- **WHEN** a plugin tool declares label `Review comments`, icon `comment` and summary `{path}[ · {status}]`
- **THEN** its rows show that label and icon, and the summary is `src/a.ts · open` when both arguments are given and `src/a.ts` when `status` is absent

#### Scenario: Unknown icon
- **WHEN** a declaration names an icon outside the allow-list
- **THEN** the row uses the default icon, label and summary still apply, and the loader reports a warning

### Requirement: Presentation for all built-in native tools
Every native tool shipped with the core runtime and official plugins SHALL declare a presentation with a human-readable label (words rather than the snake_case or camelCase identifier; capitalisation alone suffices only for single-word names such as `read` → `Read`) and a non-default icon. Each of read, write, edit, grep, find, bash and eval SHALL have exactly one summary format used on every surface.

#### Scenario: Todo update row
- **WHEN** an agent calls `todo_update` without a title and with three tasks
- **THEN** the row shows the checklist icon, label `Todos` and summary `3 tasks`

#### Scenario: Final HTML answer
- **WHEN** an agent calls `respondHtml`
- **THEN** the summary is the first line of `text` and never contains the `html` argument

### Requirement: One presentation across chat surfaces
The server SHALL resolve label, icon, category and summary for a tool call with a single resolver and send them with every tool event and every active tool. Finished rows, running rows, mobile tool modals and work-group headers SHALL use these values; the client SHALL contain no per-tool table and SHALL map only allow-listed icon identifiers.

#### Scenario: Running then finished
- **WHEN** a `bash` call is running and then completes
- **THEN** the collapsed running row and the collapsed finished row show the same icon, label and summary

#### Scenario: Native name alias
- **WHEN** a transcript contains a call named `tools_eval`
- **THEN** it is presented with the `eval` declaration

### Requirement: No truncation of content
The server SHALL NOT shorten summaries or arguments for presentation on any surface, including active-tool data; large arguments MAY be delivered by reference and loaded on expand. A collapsed row SHALL be a single line clipped only visually, with the full summary available as a tooltip and to assistive technology. An expanded row SHALL show the complete arguments and output available for the call.

#### Scenario: Long command collapsed
- **WHEN** a `bash` command's first line is longer than the row width
- **THEN** the row ends with an ellipsis and hovering shows the full first line

### Requirement: Full call in expanded view
An expanded tool row — finished, running or in the mobile modal — SHALL show a Call section before the Output section. `command` and `code` arguments SHALL be shown in full as wrapped monospace text with a copy action; a `path` SHALL offer opening in Canvas; other arguments SHALL be listed as key/value entries with nested values expandable to their full content.

#### Scenario: Running command fully visible
- **WHEN** a multi-line `bash` command is still running and the user expands its row
- **THEN** the whole command is shown in the Call section above the live output

#### Scenario: Large running arguments
- **WHEN** a running call's arguments exceed the live broadcast size limit
- **THEN** expanding the row loads and shows the complete arguments

### Requirement: Full output of a running call
While a tool call that streams output runs, the server SHALL retain its output produced so far, not only a tail, and SHALL expose it by byte offset to clients with access to the agent. An expanded running row SHALL first load the retained output and then append newer output on each refresh without gaps or duplicates. Retained output SHALL be released when the call ends.

#### Scenario: Expand a long-running command late
- **WHEN** a command has printed 50 000 lines and the user expands its running row
- **THEN** the panel shows output from the first line and keeps appending new lines live

#### Scenario: Reconnect while running
- **WHEN** the client misses live chunks because of a reconnect
- **THEN** on the next refresh it requests output from its last received offset and the shown output stays complete

#### Scenario: Foreign agent output
- **WHEN** a client without access to the agent requests a running call's output
- **THEN** the request is rejected and no output is returned

#### Scenario: Call ends
- **WHEN** the running call finishes
- **THEN** the row shows the stored tool result and the server discards the retained running output

### Requirement: Bounded running output
Retained running output SHALL be limited by a per-run cap. Beyond the cap the oldest output MAY be dropped and SHALL be replaced by a visible marker stating how much was dropped.

#### Scenario: Output beyond the cap
- **WHEN** a running command has produced more output than the per-run cap
- **THEN** the expanded row starts with a marker stating how much earlier output was dropped, followed by the retained output

### Requirement: Safe summaries and arguments
Summaries SHALL never be a serialized argument object. Without a declared summary or matching value, the summary SHALL be the first line of the first non-empty string argument other than `html` and secret-bearing keys, or empty. Values of `secrets` (including secret references), `env` and arguments whose schema property has `x-secret: true` SHALL be redacted on the server in summaries, active-tool broadcasts and tool details.

#### Scenario: No string argument
- **WHEN** a tool without presentation is called with only object or numeric arguments
- **THEN** the row shows the fallback label with no summary

#### Scenario: Secrets redacted
- **WHEN** a `bash` call passes `secrets` and `env`
- **THEN** the expanded Call section shows those keys with redacted values and no secret reference or value appears in any broadcast

### Requirement: Consistent row styling
Tool rows SHALL share one layout for running and finished state: category-tinted icon, weighted label, muted summary in monospace for file, search and command categories, and an error state marked by icon and accent rather than text colour alone, in light and dark themes and on mobile.

#### Scenario: Failed call
- **WHEN** a tool call fails
- **THEN** its row shows the error icon treatment and remains readable in both themes

### Requirement: Undeclared and historical tools
A tool name with no loaded declaration SHALL render with the default wrench icon and its raw name as label. Declarations of mounted plugins SHALL be used even when the tool is not granted to the agent. Presentation SHALL be computed at read time; stored transcript events SHALL NOT be rewritten.

#### Scenario: Historical tool from a removed plugin
- **WHEN** a transcript contains a call to a tool whose plugin is no longer mounted
- **THEN** the row renders with the default icon and raw name, and its expanded view still opens
