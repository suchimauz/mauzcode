# Projects and personal chat tabs

## Purpose
Describe how exact workspace identity groups navigation chats while each viewer keeps separate project titles, order, tabs and archive state.

<!-- last_verified: 2026-11-22 at d35de7c2; inspected src/projects inputs clean; tests read, not run -->

## Requirements

### Requirement: Exact workspace identity
A project ID SHALL depend on the normalized absolute directory and trimmed host, treating `local` and the empty host alike. Relative directories SHALL be rejected.

#### Scenario: Aliases versus distinct workspaces
- **WHEN** callers identify `/work/a/../b/` on ` local ` and `/work/b` without a host
- **THEN** both return the same ID, distinct from `/work/b/sub` or `/work/b` on a remote alias

<!-- id: projects.identity.normalized-host-dir -->
<!-- kind: invariant -->
<!-- entities: project, workspace -->
<!-- enforced: src/projects/identity.ts projects.identity -->
<!-- test: src/projects/projects.test.ts :: identity is lexical exact host and directory; rejects relative -->

### Requirement: Personal projects and shared discovery
The project list SHALL combine the viewer's stored memberships and titles with projects discovered from navigation chats. Listing discovered workspaces SHALL NOT create stored projects.

#### Scenario: Two viewers of one workspace
- **WHEN** Alice creates an empty project and Bob has neither a membership nor a navigation chat there
- **THEN** Bob does not see it; if he creates his own project at that workspace, it has the same ID without replacing Alice's title

#### Scenario: Resolve a direct chat link
- **WHEN** a navigation chat has an absolute workspace directory
- **THEN** its direct link resolves to the visible project for that exact workspace; a missing, non-navigation or unassigned chat resolves to no project

<!-- id: projects.list.membership-discovery -->
<!-- entities: viewer, project, chat -->
<!-- enforced: src/projects/list.ts projects.list; src/projects/resolve.ts projects.resolve -->
<!-- test: src/projects/projects.test.ts :: empty projects and custom titles isolated between viewers -->
<!-- test: src/projects/projects.test.ts :: discovery exceeds 500 and shared chats remain visible without writes -->

### Requirement: Fresh project chat
Creating a project chat SHALL start a navigation chat in the selected project's directory and host with no parent or fork offset, open its tab and return both IDs.

#### Scenario: Create in a remote project
- **WHEN** a viewer creates a chat in a project on a remote alias
- **THEN** the start request uses that alias and the project's directory, and the new chat is selected in that project

<!-- id: projects.createChat.root-open -->
<!-- entities: project, chat, tab -->
<!-- enforced: src/projects/createChat.ts projects.createChat; src/projects/open.ts projects.open -->
<!-- test: src/projects/projects.test.ts :: new root chat receives exact project and no parent or generation (start arguments) -->

### Requirement: Personal sidebar order
A sidebar reorder SHALL accept only an exact permutation of the viewer's visible non-archived projects, including virtual ones. It SHALL preserve archived slots and leave other viewers' preferences unchanged.

#### Scenario: Reorder around an archived project
- **WHEN** the saved order is A, B, C, B is archived and the viewer submits C, A
- **THEN** restoring B yields C, B, A; omitting an active project or including B while it is archived is rejected without saving the invalid order

#### Scenario: Discover another workspace after sorting
- **WHEN** new projects appear after a viewer saves an order
- **THEN** ranked projects keep their order and unranked projects follow by title, then ID

<!-- id: projects.reorderProjects.active-permutation -->
<!-- entities: viewer, project, sidebar -->
<!-- enforced: src/projects/reorderProjects.ts projects.reorderProjects; src/projects/list.ts projects.list -->
<!-- test: src/projects/projectOrder.test.ts :: archived slots and relative order survive reorder and restoration -->
<!-- test: src/projects/projectOrder.test.ts :: rejects omitted, duplicate, foreign, archived and malformed IDs without writes -->
<!-- test: src/projects/projectOrder.test.ts :: saved order survives repeated reads; newcomers append deterministically; viewers isolated -->

### Requirement: Ordered personal tabs
Opening an active project chat SHALL select it, appending it only if absent. Reordering SHALL require every open tab exactly once. Closing SHALL change only the viewer's tabs, not the chat.

#### Scenario: Select and close a middle tab
- **WHEN** tabs are ordered C, B, A and the viewer selects and closes B
- **THEN** C becomes active and A remains second; closing the first active tab instead selects the first remaining tab, or none if empty

#### Scenario: Concurrent opens
- **WHEN** two opens for different chats compete on the same tab revision
- **THEN** the stale update retries against current state rather than overwriting the successful open; exhausting the retry limit reports a navigation conflict

<!-- id: projects.updateTabs.revision -->
<!-- entities: viewer, project, chat, tab -->
<!-- enforced: src/projects/updateTabs.ts projects.updateTabs -->
<!-- test: src/projects/projects.test.ts :: tabs CAS preserves competing opens, personal selection, order and close only -->

### Requirement: Read-only tab projection
Reading tabs SHALL return only the viewer's saved tabs still present among the project's active chats, in saved order, without persisting the filter.

#### Scenario: Selected chat becomes unavailable
- **WHEN** an archived or moved chat is no longer in the active chat list
- **THEN** its tab is absent and, if it was selected, the first remaining tab is selected or the selection is null

<!-- id: projects.tabs.valid-filter -->
<!-- entities: tab, project, chat -->
<!-- enforced: src/projects/tabs.ts projects.tabs -->
<!-- test: src/projects/projects.test.ts :: archive/move filtering is read-only and restored ID can reopen -->

### Requirement: Personal archive projection
Archiving or restoring a project SHALL affect the viewer's project status without changing chat records or tabs. A navigation chat created strictly after archival in the same normalized workspace SHALL make the project appear active again.

#### Scenario: Archive while a chat is running
- **WHEN** Alice archives a project with a running chat and Bob has not archived it
- **THEN** the project appears archived for Alice but not Bob, with the chat and saved tabs unchanged

#### Scenario: Reactivation is workspace-specific
- **WHEN** a newer chat is hidden, belongs to a team rather than navigation, or is in a subdirectory or on another host
- **THEN** it does not reactivate the archived project; a newer navigation chat in the exact workspace does

<!-- id: projects.setArchived.personal-timestamp -->
<!-- entities: viewer, project, chat -->
<!-- enforced: src/projects/setArchived.ts projects.setArchived; src/projects/list.ts projects.list -->
<!-- test: src/projects/projects.test.ts :: project archive is personal, preserves agents and tabs, and newer nav creation reactivates exact workspace -->

### Requirement: Chat archive eligibility
The project chat list SHALL report whether each chat can be archived, with busy state taking precedence over a scheduled wake, and a scheduled wake over a queued run.

#### Scenario: Idle chat with pending work
- **WHEN** an idle chat has no live run but has a wake time
- **THEN** its archive control is reported unavailable with reason `scheduled`; with only a queued run the reason is `queued`, and with neither it is eligible

<!-- id: projects.chats.archiveBlockedReason -->
<!-- entities: project, chat -->
<!-- enforced: src/projects/chats.ts projects.chats -->
<!-- test: src/projects/pagesArchiveGuard.test.ts :: archive eligibility reflects idle queued wake and live run guards without writes -->

<!-- source: src/projects/$route_action_POST.ts; src/projects/navigationUi.test.ts; further sources and named tests above -->
<!-- uncertainty: The creation test substitutes agent.start; it does not exercise generation or recovery after tab opening fails. Archive eligibility here is list output, not authorization to archive a session. -->
<!-- deferred: src/projects/materialize.ts; src/projects/principal.ts; src/projects/closeTab.ts; src/projects/reorder.ts -->
