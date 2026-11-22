# Workspace navigation

## Purpose
Describe which destinations and widgets appear in the workspace menu, how its search combines independent sources, and how users pin chats and move between unread chats.

<!-- last_verified: 2026-11-22 at d35de7c2; inspected navigation sources clean; tests read, not run -->

## Requirements

### Requirement: Declared page destinations
The menu SHALL list declared applications rather than deriving page entries from HTTP routes. It SHALL exclude mounted plugin detail links while allowing the declared `/plugins` catalogue.

#### Scenario: A plugin declares an app and exposes other routes
- **WHEN** the caller requests page destinations without chats
- **THEN** the declared app can appear, but an undeclared endpoint and a `/plugins/` detail page do not appear.

<!-- id: nav.items.apps -->
<!-- kind: invariant -->
<!-- entities: application, destination -->
<!-- enforced: src/nav/items.ts default export, apps and all -->
<!-- verified_by: src/nav/items.test.ts — global navigation keeps plugin applications and one catalogue link, not mounted plugin records; HTTP routes never become menu entries without an app declaration -->

### Requirement: Effective menu layout
A valid personal layout SHALL replace the instance layout rather than merge with it. Without a valid personal layout the menu SHALL use the valid instance layout, or the default if neither exists.

#### Scenario: Personal override without hidden tabs
- **WHEN** an instance layout hides a tab but the viewer's valid personal layout omits the hidden list
- **THEN** the effective layout does not inherit the instance's hidden list.

<!-- id: nav.effectiveLayout.mine -->
<!-- entities: viewer, layout -->
<!-- enforced: src/nav/effectiveLayout.ts default export, mine and shared -->

### Requirement: Widget placement across tabs
The default menu SHALL separate daily pages on Home from management pages on Management. A saved layout SHALL NOT gain Management unless it lists that tab. The Plugins tab SHALL collect eligible non-navigation widgets not placed on other tabs.

#### Scenario: Saved layout without Management
- **WHEN** a saved layout omits Management and leaves a registered plugin widget unplaced and not hidden, with Plugins visible
- **THEN** the widget appears on Plugins and the menu does not add Management.

<!-- id: nav.tabs.declared -->
<!-- entities: layout, tab, widget -->
<!-- enforced: src/nav/tabs.ts default export, declared and resolve -->
<!-- verified_by: src/nav/overview.test.ts — default overview separates management, preserving saved layouts and hidden tabs (Management behavior) -->

### Requirement: Tab and prefix search selection
Search SHALL use the requested tab's sources, falling back to the first tab for an unknown tab. A matching prefix SHALL restrict selection to matching sources and remove the first matched prefix before dispatch.

#### Scenario: Source-specific query
- **WHEN** a trimmed query starts with a prefix unique to one source on the selected tab
- **THEN** only that source receives the remaining trimmed query.

<!-- id: nav.searchAll.prefixed -->
<!-- entities: query, tab, search source -->
<!-- enforced: src/nav/searchAll.ts default export, tab and prefixed -->
<!-- verified_by: src/nav/search.test.ts — search asks sources in parallel, groups by source order, isolates failures and honours prefixes -->

### Requirement: Bounded independent search groups
Search SHALL query selected sources concurrently and return one group per registered selection, sorted by source order then ID. A failed or timed-out source SHALL return an empty error group without discarding successful groups.

#### Scenario: A source exceeds its budget
- **WHEN** one source returns rows and another exceeds its timeout
- **THEN** the response includes the successful rows up to the per-source limit and an error for the timed-out source, whose abort signal is set; HTML and pending lists are empty.

<!-- id: nav.searchAll.run -->
<!-- entities: search source, result group -->
<!-- enforced: src/nav/searchAll.ts default export, sources and run -->
<!-- verified_by: src/nav/search.test.ts — slow sources settle as data and over-budget sources abort without HTML tokens -->

### Requirement: Shared chat pins
Posting a pin form for an existing chat SHALL clear its shared pin for `pinned=0` and set it otherwise. Success SHALL return 204 and request both navigation and dock refreshes. An unknown chat SHALL return 404.

#### Scenario: Remove a pin
- **WHEN** an existing pinned chat receives a pin request with `pinned=0`
- **THEN** its pin is removed and the 204 response names `nav-refresh` and `dock-refresh` in `HX-Trigger`.

<!-- id: nav.agentPin.pinned -->
<!-- entities: chat, shared pin -->
<!-- enforced: src/nav/$route_agent_$id_pin_POST.ts default export, exists and pinned -->
<!-- verified_by: src/nav/pinRoute.test.ts — pins and unpins an agent and asks HTMX to refresh the menu; returns 404 for an unknown agent -->

### Requirement: Next unread chat
The next-unread route SHALL skip read chats and return the unread ID after the current one in session-list order, wrapping to the first. An absent or non-unread current ID SHALL select the first unread ID, or null if none exists.

#### Scenario: Wrap past the last unread chat
- **WHEN** the current ID is the last unread chat in the session list
- **THEN** the response contains the first unread ID, even if that is the current chat itself.

<!-- id: nav.nextUnread.index -->
<!-- entities: chat, unread count -->
<!-- enforced: src/nav/$route_next_unread_GET.ts default export, agents and index -->
<!-- verified_by: src/nav/$route_next_unread_GET.test.ts — returns next unread with wrap and skips read agents; returns null when nothing is unread -->

<!-- uncertainty: Refresh headers are observable; client refresh completion was not verified. -->
<!-- deferred: src/nav/editLayout.ts, src/nav/saveLayout.ts (layout editing and persistence) -->
