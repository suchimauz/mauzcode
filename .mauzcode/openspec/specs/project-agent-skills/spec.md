# project-agent-skills Specification

## Purpose
Let a MauzCode agent discover and use portable Agent Skills for the current project, regardless of where their files live, without treating skill content as executable runtime extensions.

## Requirements

### Requirement: Portable Agent Skills packages
A skill SHALL be a directory containing `SKILL.md` with YAML frontmatter and Markdown instructions as defined by the [Agent Skills specification](https://agentskills.io/specification). The required `name` SHALL match the package directory name; `description` SHALL state what the skill does and when to use it. Standard optional fields and packaged resources SHALL remain available without changing the short name in the file.

#### Scenario: Read a portable package without conversion
- **WHEN** a package named `review` includes a valid `SKILL.md`, optional license and metadata, and files in `references/`, `scripts/` or `assets/`
- **THEN** its short name stays `review`, its supplied metadata is preserved, and its instructions and resources can be read through its qualified ID.

#### Scenario: Invalid manifest is isolated
- **WHEN** a package lacks `description` or its `name` does not match its directory
- **THEN** the package is rejected with a source-specific diagnostic and other valid packages remain available.

### Requirement: Workspace packages and named roots
The catalogue SHALL discover immediate package directories in `<workspace>/.mauzcode/skills/` and in named roots declared by that project in `.mauzcode/skills.json`. Roots SHALL be workspace-relative directories on the workspace's own host. Discovery SHALL NOT recursively search the repository, the server's current directory or other tools' default skill roots.

#### Scenario: Default, additional and unrelated directories
- **WHEN** `review` exists in `.mauzcode/skills/`, `docs/skills/` and an undeclared directory, and the project declares `"roots": {"team": "docs/skills"}`
- **THEN** the first two are available as `skill.workspace:review` and `skill.workspace.team:review` respectively, and the third contributes no entry.

#### Scenario: Remote project and workspace switch
- **WHEN** a chat moves between local and SSH workspaces with different skills and identical directory names
- **THEN** workspace discovery and subsequent reads use the current host and project configuration and never fall back to the previous workspace or the server's checkout.

### Requirement: Server packages scoped by installation and project
Server-side skills SHALL be ordinary package directories in a persistent, installation-owned library outside source trees: `global/<name>/` for all projects or `projects/<project-id>/<name>/` for one project. The project key SHALL be MauzCode's existing identity for the workspace host and normalized absolute path. Saving a server package SHALL NOT write to the target workspace or store package contents in PostgreSQL.

#### Scenario: Global versus project scope
- **WHEN** `review` exists in both branches and a second chat opens the same project after a server restart
- **THEN** both `skill.server.global:review` and `skill.server.project:review` are available to an authorized reader in that chat; a different project can see the global package but not the first project's package.

#### Scenario: Similar paths on different hosts
- **WHEN** two SSH projects have the same absolute path on different hosts
- **THEN** each uses its own project library; adding to either server-side library changes neither remote workspace.

#### Scenario: Renamed SSH alias
- **WHEN** the SSH alias of a project with server packages is renamed
- **THEN** the renamed workspace is a new project without those packages; the old branch is kept, not deleted, and the Creator inventory lists it as orphaned with its former host and path.

### Requirement: Explicit plugin exports and workspace enablement
Only directories explicitly listed in a mounted plugin's `procs.skills` manifest field SHALL be skill exports. `.` SHALL export its root only if explicitly listed and valid. Workspace configuration SHALL enable exports individually via exact canonical IDs in `enabledPluginSkills`. An absent or empty list enables none; wildcard or malformed entries SHALL NOT grant access. A plugin reload or unmount SHALL refresh its exports without restarting the server.

#### Scenario: Opt in to one of two exports
- **WHEN** Git declares `"skills": ["skills/review", "skills/summarize"]` and the project enables only `skill.plugin.git:review`
- **THEN** an agent with the read and Git grants can use `review` but not `summarize`; listing `skill.plugin.git:*` instead enables neither.

#### Scenario: Documentation is not implicitly exported
- **WHEN** a plugin ships a root `SKILL.md` but does not list `.`
- **THEN** the root is not exposed through Skills, and existing plugin documentation and the external `mauzcode skills mount` workflow keep their existing behavior.

#### Scenario: Change or remove an export
- **WHEN** the plugin reloads with a changed export or is unmounted while its ID remains in the project file
- **THEN** a subsequent read returns the changed package or reports it unavailable, respectively; the old copy is not served.

### Requirement: Qualified identity without shadowing
Every published package SHALL have exactly one canonical ID per declared origin: `skill.workspace:<name>`, `skill.workspace.<root>:<name>`, `skill.server.project:<name>`, `skill.server.global:<name>` or `skill.plugin.<plugin>:<name>`. Matching short names across origins SHALL coexist; an ambiguous full ID SHALL be diagnosed, never resolved by scan order.

#### Scenario: Identical short names from two plugins
- **WHEN** two enabled plugins `git` and `checks` export `review`
- **THEN** `skill.plugin.git:review` and `skill.plugin.checks:review` address different packages, regardless of load order.

#### Scenario: Duplicate export inside one plugin
- **WHEN** one plugin exports two distinct packages that both claim `skill.plugin.git:review`
- **THEN** that ID cannot be read until disambiguated, diagnostics identify the conflict, and unrelated IDs still resolve.

### Requirement: Source labels
Each skill SHALL carry a default source label: `Workspace`, `Workspace · <root>`, `Server · project`, `Server · global`, or the plugin's display name.

#### Scenario: Server and workspace skills are distinguishable
- **WHEN** `review` exists in the workspace default root and the server project library
- **THEN** the menu shows `review · Workspace` and `review · Server · project`, and neither label resembles a `/project:<name>` prompt command.

### Requirement: Progressive discovery and resource reading
Before use, only authorized IDs, names, sources and descriptions SHALL be exposed, also via `skills.list`. The native `read_skill` (core `skills.read`) SHALL resolve an exact ID alone. Without `path` it SHALL return metadata, instructions, package directory and resource listing; with `path`, that resource. Long text SHALL be continuable in bounded pieces. Images SHALL be attachments like `read`; other binaries are reachable only by path.

#### Scenario: Agent selects from descriptions
- **WHEN** a task matches an available description without the person invoking a slash command
- **THEN** the agent can call `read_skill` with that ID, followed by the same ID and `references/checklist.md` if needed; no other package bodies or resource contents are preloaded.

#### Scenario: Continue a large result and access an asset
- **WHEN** instructions exceed one response or the caller requests `assets/template.png`
- **THEN** the caller can obtain the remaining text without silent truncation, or receives the image as an attachment, respectively; the asset is not embedded as model text.

### Requirement: Packaged scripts run in the workspace
The agent SHALL run packaged scripts with its own shell tool on the workspace host; MauzCode SHALL NOT run skill content. Workspace packages SHALL be used in place. On first read, a server or plugin package revision SHALL be copied to `~/.cache/mauzcode/skills/<id>/<revision>/` on the workspace host, keeping paths and executable bits, read-only, outside the repository; `read_skill` reports that directory. Reading SHALL NOT grant shell access.

#### Scenario: Server skill on an SSH workspace
- **WHEN** an agent on an SSH workspace reads `skill.server.global:review` whose instructions say to run `scripts/check.sh`
- **THEN** `read_skill` returns a directory on the SSH host containing an executable `scripts/check.sh`, the agent can run it with `bash`, and nothing is written into the repository.

#### Scenario: Package changes after caching
- **WHEN** the server package is edited after an earlier read
- **THEN** the next read reports a new revision directory with the new files, and the previous cached copy is not presented as current.

#### Scenario: Agent without shell
- **WHEN** an agent whose preset lacks the shell reads a skill with scripts
- **THEN** it receives the instructions and resource listing but no new tool or permission to execute the scripts.

### Requirement: Skill packages are bounded data, not runtime extensions
Discovery, reading and import SHALL impose documented limits on file count, size and reads, reject paths and links escaping the permitted root or package, and never execute package content. Files under skill roots SHALL NOT be registered as runtime code, including during startup or reload. One invalid or unreachable source SHALL NOT disable unrelated sources. A config read failure SHALL NOT enable plugin skills by default.

#### Scenario: Runtime-shaped file in a skill
- **WHEN** a skill in the MauzCode checkout contains `scripts/example.ts` or a file resembling a command declaration
- **THEN** neither runtime discovery nor hot reload loads it as a function or command, and listing or importing the package does not execute it.

#### Scenario: Unreadable or oversized source
- **WHEN** an SSH root is unreachable or one package exceeds a limit
- **THEN** the failure has a bounded diagnostic, healthy sources remain usable, and an unavailable requested ID is not substituted.

#### Scenario: Escaping root or resource
- **WHEN** a configured root escapes the workspace, or a requested resource escapes its package through a relative path or a link
- **THEN** the path is rejected without reading or exposing its target.

### Requirement: Creator prepares one portable package
The native `add_skill` workflow SHALL let an authorized Creator clarify the source, destination and optional adaptation. Sources SHALL include a description to draft, a prepared server/workspace directory, and a public HTTPS Git repository. Destinations SHALL include the workspace default root and the server's current-project and global libraries. An import SHALL preserve file contents by default; adaptations SHALL be proposed separately, not made silently.

#### Scenario: Draft from a description
- **WHEN** the person requests a new skill without specifying how or where to store it
- **THEN** Creator asks for the missing choices and prepares a valid named package; drafting alone publishes nothing.

#### Scenario: Import from a directory
- **WHEN** the person selects a ready package on the server or in an SSH workspace and asks to adapt it
- **THEN** the preview preserves the original resources and distinguishes proposed path rewrites such as `.mauzcode/…` from unchanged files; the source folder is not modified.

#### Scenario: Select a Git package
- **WHEN** the person provides a public HTTPS Git repository containing multiple packages
- **THEN** the workflow selects one package with the person, pins the revision, and prepares it without local credentials, executing repository content or installing unrelated packages.

### Requirement: Confirmed and verifiable publication
Before saving, the workflow SHALL show the full ID, destination and scope, file inventory, and reviewable draft or proposed changes. Confirmation SHALL apply only to the version shown. Publication SHALL be atomic and MUST NOT overwrite an existing ID. Cancellation SHALL create no installed skill. Success SHALL be reported only after the saved ID and contents have been verified through discovery and `read_skill` in the intended scope.

#### Scenario: Approve or cancel a version
- **WHEN** the person confirms the preview for `skill.server.project:review`
- **THEN** the reviewed files become visible together in that project and verification reads the saved package; cancelling instead leaves both the destination and catalogue unchanged.

#### Scenario: Stale preview or competing installation
- **WHEN** the proposed files or destination change after preview, or a different install creates the ID before saving
- **THEN** changed content needs a new preview and confirmation; a destination conflict fails without overwriting files or exposing a partial installation.
