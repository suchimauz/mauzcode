# Tasks

Implementation backlog for separate approval. No checkbox represents creation of these OpenSpec artifacts. Part A (sections 1–5) delivers reading and invocation and can ship on its own; Part B (sections 6–7) adds Creator authoring on top of it.

# Part A — Reading and invocation

## 1. Package format and safe roots

- [x] 1.1 Implement Agent Skills frontmatter validation and source-qualified IDs (`skill.workspace[.<root>]`, `skill.server.project`, `skill.server.global`, `skill.plugin.<plugin>`) with default source labels. Unit-test required/optional fields, valid digit-leading skill names, directory-name mismatches, qualified collisions, and rejection without shadowing another package.
- [x] 1.2 Implement bounded package discovery, manifest/resource reading and safe canonical root checks. Test traversal, symlinked parents/resources, special files, size/count limits, and isolation of one malformed package. Document the limits alongside a minimal portable package.
- [x] 1.3 Separate package data from runtime registration. Verify cold discovery and reload against a workspace package containing TypeScript and declaration-shaped resources; an overlapping custom root is rejected without suppressing legitimate runtime modules.

## 2. Source adapters and catalogue

- [ ] 2.1 Read only the workspace default and named roots from `.mauzcode/skills.json` through local/SSH-aware access. Test same-path workspaces on different hosts, undeclared directories, invalid configuration, and failure of one remote root without local fallback. Document the config example and nonrecursive discovery.
- [ ] 2.2 Add the installation-owned library with `global/` and `projects/<project-id>/` branches (read side). Verify persistence across restarts, visibility across two chats in one project versus another project, and a renamed SSH alias producing a new project. Document the default location, override and filesystem backup.
- [ ] 2.3 Read explicitly declared `procs.skills` directories from mounted plugins and invalidate exports on reload/unmount. Test opt-out by default, `.` as an explicit root export, duplicate exports and manifest resource boundaries; document an explicit export and the difference from `plugins.read` and external mounts.
- [ ] 2.4 Merge source descriptors by canonical ID, track source revisions (content digests) and expose bounded diagnostics. Test same short names in all sources and two plugins, config/file edits without restart, stale metadata invalidation and one unreachable source alongside healthy sources.

## 3. Permissions

- [ ] 3.1 Add core functions `skills.list` and `skills.read`, the shared session/project read policy and the explicit Standard grant for both. Verify Standard, Creator, Minimal, explicit custom readers, unchanged pre-upgrade snapshots, intersected parent rules and identical project paths on different hosts. Document the effective preset matrix.
- [ ] 3.2 Enforce individual plugin enablement in addition to an effective plugin grant. Test all gate combinations, wildcard rejection, disabled exports invisible to normal discovery, and read/dispatch denial for guessed IDs.

## 4. Reading and scripts

- [ ] 4.1 Introduce native `read_skill` over `skills.read`: instructions, package directory, resource listing, text continuations and image attachments. Test direct/native parity, bounds, wrong agent/path, changed revision and a continuation after disabling an export. Include a two-call reference-reading example in tool docs.
- [ ] 4.2 Materialize server and plugin packages into `~/.cache/mauzcode/skills/<id>/<revision>/` on the workspace host (local and SSH), preserving paths and executable bits, read-only, atomically. Test running a packaged script via `bash` on an SSH workspace, a new revision after editing, concurrent first reads, nothing written into the repository, and no new execution path for an agent without shell.
- [ ] 4.3 Add capability-gated, bounded metadata discovery for automatic selection. Verify descriptions, not package bodies, appear before activation; later entries in large catalogues remain discoverable, hidden skills stay absent, and instructions or `allowed-tools` never extend permissions.

## 5. Catalogue, commands and chat presentation

- [ ] 5.1 Register the skill kind and **Skills** section in the existing catalogue, reserve `skill.` and support full skill IDs in server/client parsing. Test digit-leading names, coexistence with `/git:review` and `/project:<name>`, rejection of namespace squatting, and unchanged ordinary paths, legacy fields and per-agent mobile catalogue behavior.
- [ ] 5.2 Carry the authorized project and preset through new-session discovery and first-message validation; keep existing chats scoped to their agent. Test initial/default preset, workspace or preset changes, stale responses and direct submission without opening the menu.
- [ ] 5.3 Dispatch through the normal command receipt, session and queue path: keep the user message, append a synthetic completed `read_skill({id})` call and result, then schedule one turn. Verify the persisted command, ID and source label, that the model does not need a second read, that removed/disabled skills cause no substitution or turn, the "open a new chat" error for snapshots without skill reading, and request-key behavior for first and later messages.
- [ ] 5.4 Render searchable short-name/source rows and a friendly composer chip over the canonical draft. Test pointer, keyboard, direct paste, two `review` results, distinguishing labels, accessible copy, draft restoration and editing the suffix; selection alone must not send. Document a complete menu-to-send example.
- [ ] 5.5 Render a copyable chip from stored skill event metadata in history. Verify exact copy after plugin removal, no package content replacing the user message, plain slash-looking prose unchanged, and compatibility with historical events lacking the new metadata.

# Part B — Creator authoring

## 6. Creator identity and inventory

- [ ] 6.1 Add `skills.inventory` and `skills.add.*`, gated on the built-in Creator (`presetId === 'creator'` for the agent and every parent) both when offering `add_skill` and in handlers. Test a genuine Creator, a custom `*` preset, narrowed child agents and direct handler calls with client-supplied identity.
- [ ] 6.2 Inventory lists disabled plugin exports and orphaned server project branches (with host/path from `project.json`) without exposing bodies or making them usable.

## 7. Addition and import

- [ ] 7.1 Guide the user through source, scope and adaptation choices; prepare a draft or copy one selected server/local/SSH package with relative files and license intact. Test each source, all three destinations, unchanged default bytes and a separately previewed `.mauzcode/` adaptation without editing the original.
- [ ] 7.2 Prepare one package from a public HTTPS Git repository pinned to an immutable revision. Test a multi-package fixture, changed branch head, bounded downloads, rejected private/local/credentialed destinations and no execution, hooks or submodule fetches. Document the public-only limitation.
- [ ] 7.3 Bind a human review to the staged digest, full ID, destination and owning context. Test the exact preview/diff, cancellation, expiration, changed content or destination requiring a new review, and inability to approve via a tool-supplied boolean.
- [ ] 7.4 Publish the reviewed package atomically without replacement (writing `project.json` for new project branches), then verify via the catalogue and `read_skill`. Test competing writers, retries, SSH interruption and verification failure after publication; no overwrite, partial visibility or unverified success. Document one end-to-end addition and recovery guidance.

# Acceptance

## 8. Cross-surface acceptance

- [ ] 8.1 Exercise a workspace and mounted plugin exposing `review` plus both server scopes in isolated fixtures. Verify discovery, auto-selection, script execution on local and SSH workspaces, first-message and existing-chat invocation, historical copy, revocation and continued access to unrelated skills from end to end.
- [ ] 8.2 Run the isolated backend and frontend suites for the affected paths, the project checks and strict OpenSpec validation. Record the exercised scenarios and confirm existing commands, `plugins.read` and `mauzcode skills mount` remain compatible without touching live user packages.
