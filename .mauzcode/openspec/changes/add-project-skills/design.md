# Design

## Context

See [the proposal](proposal.md) for motivation. `commands.catalogue` and `commands.candidates` already supply the slash menu, but before session creation they do not receive the draft's project and preset. `CommandEditor` already claims a command token, and transcript rendering already uses persisted command metadata rather than highlighting arbitrary text. Mounted plugin `SKILL.md` files currently document the plugin for `plugins.read`; `external.mountSkills` exports workflows to other harnesses. Neither mechanism is a catalogue of project Agent Skills.

## Goals / Non-Goals

**Goals:** one ID from menu to tool to resource; one policy decision wherever the ID is used; portable packages editable as files; bounded work even with a remote workspace. **Non-goals:** a new command system, general file access via the reader, an execution service for scripts, UI for enablement, changing `mauzcode skills mount`, automatic Git sync, or publishing packages. Presets remain guardrails, not a shell sandbox.

## Decisions

### 1. Separate a public descriptor from its private locator

Use a core Skills catalogue with adapters for workspace roots, the two server scopes and plugin exports. Its public descriptor is `{id, name, description, sourceKind, sourceLabel, qualifier?}`. The private record holds the root handle, host, package location and revision/fingerprint; clients and models do not supply these when reading. The same resolver serves automatic discovery, commands, native tools and resource delivery. The privileged inventory is a separate metadata-only view. Do not build a second menu index from whatever the browser can access.

```text
Source                 Canonical ID                   Location
Workspace default      skill.workspace:review         <workspace>/.mauzcode/skills/review/
Workspace named root   skill.workspace.team:review    <workspace>/<roots.team>/review/
Server, this project   skill.server.project:review    <library>/projects/<project-id>/review/
Server, all projects   skill.server.global:review     <library>/global/review/
Plugin Git             skill.plugin.git:review        <mounted git plugin>/<declared package>/
```

Default labels: `Workspace`, `Workspace · <root>`, `Server · project`, `Server · global`, plugin display name. The `server.` prefix keeps server libraries distinct from workspace files and from `/project:<name>` prompt commands. Core functions: `skills.list` and `skills.read` (readers), `skills.inventory` and `skills.add.*` (built-in Creator only).

Treat the Agent Skills name as the short name, not as a global key. Validate it against the upstream format; do not silently slugify names. Keep the native ID and slash grammar identical, including valid names starting with digits: accommodate these **only inside the reserved skill grammar**, without changing how ordinary commands, dotted filenames or absolute paths parse. Aliases for additional roots must be unique, nonempty namespace segments. Reject ambiguous structured IDs rather than normalizing two source identifiers to the same string. Diagnostics report conflicts to the relevant owner, not hidden origins to a reader. An unqualified short alias would become unstable when a plugin is enabled, so it is for search only.

### 2. Read config from the project; keep the server library outside it

Resolve the workspace through its trusted host and absolute directory, not the Bun process cwd. Enumerate immediate children of the default and configured roots only. Example project configuration:

```json
{
  "roots": { "team": "docs/skills" },
  "enabledPluginSkills": ["skill.plugin.git:review"]
}
```

Without this file read the default root and enable no plugin skills. Do not create it as a side effect of listing. Malformed/unsafe roots are not consulted. An unreadable or invalid enablement list never reuses stale grants. Diagnostics for one bad source must not suppress healthy independent sources. Resolve plugins from the mounted registry, using `package.json` `procs.skills` as an explicit array of relative package directories (or `.`). A root export exposes the skill document and package resources, not the entire plugin installation, credentials, `node_modules` or runtime source. Root workflow documentation alone is not an export.

Keep the library under one installation-owned data directory, using an absolute operator override `MAUZCODE_SKILLS_DIR` or, by default, `~/.mauzcode/skill-libraries/<installation-key>/` on the **server**. Derive the default key from the normalized installation workdir, never the chat workspace or a per-process UUID. Validate that the library is outside runtime source trees. Use `projects.identity` for the project branch, including on SSH; do not key by chat ID or a project title. A renamed SSH alias therefore yields a new project; old branches are never auto-deleted and Creator inventory lists them as orphaned with the host and path recorded in a small `project.json` written beside the branch on first save. Use private filesystem permissions. This keeps both server scopes portable, backs up with ordinary file tools, and avoids the database/blob migration or editing/export step a DB-backed design would require.

### 3. Authorize a current source, not a cached list

Compute a read context from the authenticated existing agent or, for a new-session preview, the authorized selected project and resolved preset/default. Do not accept client-supplied filesystem locations, grants or display labels as authority. Discovery checks the read grant and project scope; plugin exports additionally require live mount/export, workspace membership of the exact ID, and the effective plugin grant through every snapshot layer (respect existing denies). A visible skill does not imply that all functions mentioned inside it are callable. Creator's administrative listing can identify disabled exports but provides no body, resource or activation path. Both `add_skill` and inventory must verify the built-in Creator: the frozen snapshot's `presetId` is `creator` for the agent and every parent. Custom presets, including `*` grants, never qualify.

Share parsed source metadata, not an unqualified list of visible IDs. Key metadata by source, host and root, and invalidate on file/config changes, workspace change or plugin registry generation. Bound directory listings, timeouts and negative-cache lifetimes; use bounded remote reads rather than walking/copied mirrors of a repository. Check live policy and current source identity on submission, native or direct read and every continuation. A stale menu or a pasted ID cannot confer access. Omit unauthorized entries; respond to unauthorized, missing and obsolete exact IDs without revealing other packages' locations.

### 4. Progressive reading, script execution and runtime boundaries

At discovery read only the bounded header needed to validate the package and supply the descriptor. Supply allowed IDs and descriptions as delimited data, not new system rules. For large catalogues, bound the prompt excerpt and offer paginated/filterable discovery over the same permitted metadata; do not make entries unreachable because of the excerpt limit. Once the person selects an ID or the agent matches a description, `read_skill({id})` returns parsed frontmatter, the Markdown body, the package's absolute directory on the workspace host and an inventory of package-relative resources. `read_skill({id, path})` returns a resource: text with an opaque continuation tied to the same agent, package, revision and path; images as attachments like `read`; other binaries only as a path. Previously delivered content is not retroactively erased from history.

Scripts follow the Claude Code model: the agent runs them with its own `bash` on the workspace host; MauzCode never executes package content. Workspace packages are used in place. Server and plugin packages are materialized on first read into `~/.cache/mauzcode/skills/<id>/<revision>/` on the workspace host (local or SSH), via the existing remote file transport, preserving relative paths and executable bits, then made read-only; a write-to-temp-and-rename keeps concurrent readers from seeing partial copies. The revision is a content digest, so edits produce a new directory; old revisions may be pruned by age. Without a shell grant nothing new becomes runnable.

Canonicalize roots and package-relative paths, enforce containment on the actual open, reject unsafe links/special files, and cap file count, file and total bytes, page size and SSH time. Imports reject invalid or oversized packages before publishing rather than silently truncating them. Treat Markdown, optional `allowed-tools`, resources and scripts as data. Reserve `.mauzcode/skills/` as data in both initial runtime scanning and reload/watch paths, including canonical aliases. Refuse additional skill roots or plugin export directories overlapping executable source roots; a plugin's explicit `.` export must narrow its resource surface and leave its separately registered `src/` alone. This avoids both treating a package's TypeScript as a function and allowing a workspace config to disable arbitrary existing runtime code.

### 5. Carry a qualified command as text and present a friendly chip

Extend the existing catalogue with a skill kind, the **Skills** section, and source/qualifier fields, rather than hard-coding plugin names or creating client-only command recognition. Extend new-session catalogue and validation with the selected `projectId` and `presetId`, just as the actual create request carries them; invalidate pending catalogue responses when either changes. For existing chat, the server resolves those values from the agent. Preserve existing catalogue versions and the mobile per-agent contract; additions must not change the meaning of ordinary entries.

Keep `/skill.plugin.git:review check my changes` as the actual plain-text draft, including for paste, retries and draft restoration. Render only the command token as `[review · Git]`; preserve caret/edit/delete/paste and keyboard focus. Copy on either composer or transcript chip yields `/skill.plugin.git:review`. If labels collide, use the root alias or plugin identifier. Validate the exact name on submit even without a menu selection. Dispatch through the existing request-key and session persistence path, like Claude Code slash skills: keep the user's message as typed, then, before scheduling the turn, run `skills.read` on the server and append a synthetic completed `read_skill({id})` tool call and result. The model sees the instructions immediately and history shows exactly which revision was loaded. The package is data, not a user instruction granting authority. If the chat's frozen preset lacks skill reading, reject with a clear "open a new chat" message. Persist command text, canonical ID and bounded display metadata from the server. History renders from this event (even after removal), never by resolving a fresh ID or recognizing arbitrary slash-looking prose. Old events still use the existing renderer.

### 6. Creator workflow: prepare, review, publish, verify

Use one native `add_skill` entry with a checked Creator-only handler. On a human request the agent uses structured input for missing source, package, destination and adaptation choices. Draft a valid package, or read one selected folder from the chosen server/workspace host. For public HTTPS Git imports, select the package, resolve the revision to an immutable commit and preview that version. Fetch without inherited credentials, hooks, submodules or local transports; require public destinations across redirects and impose download, expansion and time limits. Do not run code or install dependencies. Except for separately proposed adaptations, preserve source bytes, relative paths and license files. Never edit the source folder or repository.

Stage a reviewable snapshot outside scanned/source roots. Display ID, exact destination scope, inventory and the drafted content or proposed diff. Bind the approval to the owning agent, content digest, workspace identity and destination, not a tool argument such as `confirm: true`. On confirmation recheck identity, scope, digest and destination availability. Publish with exclusive no-replace semantics and an atomic same-filesystem promotion at the destination (including SSH); stage outside the discoverable package namespace. Cancel/expiry, changes requiring a new preview, concurrent writers and retries must not reveal a half-installed or overwritten package. Reopen through the normal catalogue and `read_skill` and verify the reviewed package before claiming success. If verification fails after publication, report that distinction and do not blindly reinstall.

## Risks / Trade-offs

- **SSH latency or stale menus** → cache bounded metadata, recheck enablement and access live, and allow unaffected origins to work while a remote root fails. Never fall back to the host's similarly named directory.
- **Long/repeated names or untrusted descriptions** → show short source-labelled chips with exact copy, retain disambiguators, delimit and size-limit model-facing metadata. Do not silently alias a collision.
- **Grant or file changes while reading or confirming** → reauthorize continuations, detect changed revisions, and bind write approval to a concrete snapshot. Filtering is not filesystem isolation.
- **Cached copies on the workspace host** → revision-addressed, read-only and outside the repository; revocation hides them from `read_skill` but presets are not a sandbox, so a cached copy may remain until pruned.
- **Packages unexpectedly becoming runtime code** → exclude data roots before classification, on both cold load and hot reload; regression-test an inert TypeScript fixture without executing package content.

## Migration Plan

This change prepares the contract only. After separate implementation approval, add discovery and permission checks before exposing the tools, then hook up the existing chat catalogue and Creator workflow. Existing workspaces require no initialization: no package or enablement file means no workspace skill or plugin opt-in. Do not rewrite agent snapshots, seed example exports, convert plugin docs, write server skills to PostgreSQL or change external mounts. Document the filesystem layout, backup and examples before rollout. Rollback removes the new entry points without deleting packages/config or rewriting chat history; unrecognized historical entries retain their exact plain command text. No archive, runtime rollout or code edits are part of this specification review.
