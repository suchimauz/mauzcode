# Project agent skills

A **skill** is a portable Agent Skills package: a directory whose `SKILL.md` opens with a
YAML frontmatter block and continues with Markdown instructions. This page documents the
bounded local and SSH workspace readers that discover and read such packages — their limits
and where they refuse to work. It is data handling only: no package content is
imported, executed, registered as runtime code or published.

Discovery and reading are two separate steps, and both are in `src/skills/`:

| Function | Does |
| --- | --- |
| `skills.packageLimits({})` | Returns the single authoritative set of budgets below, as plain data. |
| `skills.packageScan({ anchorDir, sourceKind })` | Lists the immediate package directories of one trusted root and reads each `SKILL.md` **header only**. |
| `skills.packageFiles({ anchorDir, packageName })` | Inventories the packaged resources of one package with verified byte sizes. |
| `skills.packageFiles({ anchorDir, packageName, action: 'read', path })` | Returns one bounded page of one resource, or of `SKILL.md` itself. |
| `skills.parseManifest({ text, directoryName })` | Validates a header plus body the caller already read. |
| `skills.qualifiedId({ sourceKind, name })` | Builds or checks the canonical ID, e.g. `skill.workspace:review`. |

An **anchor** is a trusted, absolute, normalized directory — a configured skills root or a
declared plugin directory. The package name and the resource path are untrusted input; they
are validated and then re-verified on the opened object, so a link, a special file or a `..`
component is refused instead of followed.

## Workspace roots

The built-in root is `<workspace>/.mauzcode/skills/`. To add a named root, place this
configuration in `<workspace>/.mauzcode/skills.json`:

```json
{"roots":{"team":"docs/skills"}}
```

A `review/` package in the built-in root has ID `skill.workspace:review`; a `review/`
package in `docs/skills/` has ID `skill.workspace.team:review`. Discovery examines only
immediate package directories in the built-in and declared roots. It does not recursively
search the repository or look in another tool's skill directories. The configuration is
optional and never created by reads. An invalid root does not hide a healthy root. An absent,
unreadable or malformed config grants no plugin skills; an invalid `enabledPluginSkills`
list grants none either. This reader does not authorize or publish plugin packages.

Use normalized workspace-relative root paths, with no `.` or `..` components or symbolic
links. Named roots cannot overlap runtime source directories. The built-in directory is
reserved for skill data; the workspace's `src`, `.mauzcode`, `plugins`, and `node_modules`
are reserved from named roots. Local reads also check active runtime mounts. The config is
limited to 32 KiB, 16 named roots, and 128 enabled plugin IDs. The package budgets below
apply per root or package as indicated.

The workspace host and absolute directory are used together. SSH reads require Linux with
Python 3 and `/proc/self/fd` on the workspace host. The reader uses a fixed program over SSH,
never executes a package, and limits each request to eight seconds. If the host or safe read
capabilities are unavailable, it reports a bounded diagnostic without consulting local files.
A named read always rechecks the current configuration and never substitutes the default root.

## Minimal portable package

This is the whole of a valid package. The header must open on the first line with `---` and be
closed by its own `---` line; the instructions follow it verbatim.

```text
.mauzcode/skills/review/
├── SKILL.md
└── references/
    └── checklist.md
```

`SKILL.md`:

```markdown
---
name: review
description: Review the requested changes and report concrete findings.
license: MIT
metadata:
  author: team
---

# Review

Read the diff, then report findings from `references/checklist.md`.
```

The directory name and the manifest `name` must match exactly. `name` is lowercase letters,
digits and single hyphens, at most 64 characters; `description` is required and at most 1024
characters. `license`, `compatibility`, `metadata` (a flat map of strings) and `allowed-tools`
(a single string, e.g. `Read Grep`) are the optional portable fields. Any other frontmatter
field is rejected rather than silently dropped. The short name stays `review` no matter where
the package came from — only the qualified ID records the origin
(`skill.workspace:review`, `skill.plugin.<plugin>:review`).

## Limits

Every value is enforced by the reader and read back by `skills.packageLimits({})`; the table is
the same data, so tests and documentation cannot drift from the code.

| Budget | Value | Bounds |
| --- | --- | --- |
| `packages` | 100 | healthy packages returned by one scan |
| `entries` | 400 | container entries examined by one scan |
| `headerBytes` | 16 384 | `SKILL.md` bytes read per package at discovery |
| `instructionsBytes` | 262 144 | total `SKILL.md` bytes one instruction read may take |
| `resources` | 500 | regular files listed for one package |
| `resourceEntries` | 2 000 | directory entries examined while inventorying |
| `depth` | 8 | nesting depth below the package (the package is depth 0) |
| `resourceBytes` | 2 097 152 | bytes of one resource file |
| `packageBytes` | 8 388 608 | verified bytes of all regular files in one package |
| `pageBytes` | 65 536 | bytes returned by one page of one file |
| `diagnostics` | 20 | diagnostics reported per scan |
| `diagnosticChars` | 240 | characters kept in one diagnostic |

`resourceBytes` and `packageBytes` are deliberately different limits: a single file larger than
2 MiB is refused even if the package as a whole would fit, and a package whose files together
exceed 8 MiB is refused even when no single file is oversized.

Callers may pass a **smaller** value for a budget (`packageLimit`, `entryLimit`,
`headerMaxBytes`, `resourceLimit`, `depthLimit`, `pageLimit`). A larger one is silently ignored:
a ceiling that a caller can raise is not a limit.

## At a boundary

- **Exactly the limit is accepted; one byte more is not.** `SKILL.md` of exactly `headerBytes`
  (through the closing `---` line) is read; 16 385 bytes is refused with a diagnostic naming the
  limit. The same holds for `resourceBytes`, `instructionsBytes`, `packageBytes` and `pageBytes`.
- **Discovery never reads a byte of the instructions body.** The delimiter is found by a
  stateful one-byte scan, so the bytes physically read from the file equal the bytes returned in
  `headerBytes`. A chunk read would pull body bytes into the buffer even when the result
  discards them, which is not the same as not reading them.
- **The package budget applies to reading, not only to listing.** A package whose verified
  total exceeds `packageBytes` is refused by both actions, so a small file cannot be read out of
  a package that is over the limit. If a count or depth limit stops the inventory, a directory
  cannot be listed, or a file's size cannot be measured, the listing is marked `truncated` and
  omits `packageBytes`. A direct read then returns no bytes, even for a file that was measured.
- **A count budget reports truncation; a rejection does not.** Reaching `entries`, `packages`,
  `resources` or `diagnostics` sets `truncated: true` on the result. A malformed package is
  reported in `diagnostics` and never charged against the package budget of its healthy
  neighbours, and examining every candidate without cutting one short is not truncation.
- **Reading is paged.** A read returns at most `pageBytes` at `offset`, plus `nextOffset`,
  `hasMore` and the verified `total`. Pass `nextOffset` back to continue.
- **Depth counts directories, not components.** `depth` is the number of directories below the
  package, so `a/b/c/note.md` sits at depth 3 and `depth` nested directories deep is still
  listable *and* readable. The inventory and the read action apply one rule, so every resource
  the inventory offers can be passed straight back to `action: 'read'`.
- **Diagnostics are bounded and anonymous.** At most `diagnostics` lines, each at most
  `diagnosticChars` characters including the clipping ellipsis, naming the offending package or
  file — never a path outside the package, never another package's content.

## What is refused

- A resource path that is absolute, contains `.` or `..`, has an empty, doubled or trailing
  slash, or starts a component with a dot. A name outside the accepted grammar (spaces,
  non-ASCII, a leading dot) is filtered out of the inventory instead of being listed and then
  refused — the list never advertises a file the reader will not open.
- A symbolic link: as the anchor, as a package directory, as a resource directory, or as the
  file itself. Links are typed on their own descriptor and never followed.
- A special file (FIFO, device, socket) named `SKILL.md` or anywhere in the package. Nothing
  that is not a regular file is ever opened for reading, so a FIFO cannot suspend a scan.
- An anchor that is not absolute, or not normalized (`//`, a trailing slash, or a `.`/`..`
  component) — normalization is the caller's job, so two spellings of one root cannot be
  treated as two roots.
- A package without a readable regular `SKILL.md`.

Every refusal is a bounded `{ ok: false, reason }`, never an exception and never the target's
contents.

## Platform restriction

Containment is proved by binding every open to a directory descriptor through
`/proc/self/fd/<fd>`, which only Linux provides. On any other platform the reader **fails
closed**: `packageScan` and `packageFiles` return `ok: false` with a reason instead of falling
back to a path-based open that could follow a link out of the package. There is no silent
unsafe fallback. For SSH, the workspace adapter performs equivalent descriptor-bound checks
on the remote host.

## Server library

Server skills live on the MauzCode **server**, never in the workspace and never in PostgreSQL.
The library is one installation-owned directory:

- `MAUZCODE_SKILLS_DIR` — an absolute operator override; or by default
- `~/.mauzcode/skill-libraries/<installation-key>/`, where the key is derived from the
  normalized installation workdir (not the chat workspace and not a process ID).

```text
<library>/
├── global/review/SKILL.md                 → skill.server.global:review   (every project)
└── projects/<project-id>/review/SKILL.md  → skill.server.project:review  (one project)
```

`<project-id>` is `projects.identity` of the workspace host and normalized absolute path. The
same path on two SSH hosts is two projects; renaming an SSH alias makes a new project, and the
old branch is kept, never deleted. A library inside a runtime source tree is refused. Reads
create nothing: a missing branch is empty. Back the library up like any directory (for example
`tar -C ~/.mauzcode -czf skills.tgz skill-libraries`); packages are ordinary files.

## Plugin exports

A plugin's `SKILL.md` documents the plugin for `plugins.read` and for
`mauzcode skills mount`; it is **not** a project skill. A plugin exports skills only by listing
package directories in `package.json`:

```json
{"procs": {"src": "src", "skills": ["skills/review"]}}
```

That directory becomes `skill.plugin.<plugin>:review` with the plugin's display label. `.`
exports the plugin root explicitly, narrowed to `SKILL.md`, `references/`, `scripts/`, `assets/`
and license files — never `src/`, `node_modules` or other files. Exports must be normalized
relative directories without links and must not overlap the plugin's runtime source; at most
32 per plugin. The mounted registry is read on each call, so a reload or unmount applies at
once. A workspace still has to enable each export by exact ID in `enabledPluginSkills`; the
catalogue marks the others disabled.

## Catalogue

`skills.catalogue({ workspace })` merges the workspace roots, both server branches and plugin
exports by canonical ID. It re-reads files, configuration and the plugin registry every time,
so edits apply without a restart. Matching short names in different origins coexist; one ID
claimed by two packages (for example two exported directories named `review` in one plugin) is
withheld with a diagnostic until disambiguated. Each entry carries a header digest that changes
with its manifest. A failing source adds a bounded diagnostic and the rest stay available.

## Reading a skill

With both reader grants and the Skills section enabled, the bootstrap explains how to list and
read skills, even if none exist. At a safe replying request, a separate conversation row lists
new or changed exact IDs, sources and descriptions, never instructions. In one context window
the rows share **40 distinct scoped IDs and 6,000 UTF-16 characters**. Every descriptor line
costs its rendered length plus one newline; the enclosing tags are free. A shorter edit still
costs its full new line. A deletion does not withdraw the old advertisement or refund its cost.
A different workspace or SSH host is a different scope; the qualified ID identifies the source.
Entries that do not fit remain available via `ctx.fns.skills.list({ query, offset })`.

Delivery rows are their own receipts. Restart and fork reuse retained receipts, not tool results
or summaries. Compaction starts a fresh allowance. Previews, token estimates, and publication
itself do not append rows or wake agents. An upgraded legacy chat starts with a bounded baseline
without rewriting history. Rolling back restores the old bootstrap for later requests; retained
rows are historical data, not permission to read a package. Commands and each read still check
live access. When a description fits, use `read_skill` (`skills.read`) in two steps:

```text
read_skill({ id: "skill.workspace:review" })
  → frontmatter, instructions, directory, resources: references/checklist.md, scripts/check.sh
read_skill({ id: "skill.workspace:review", path: "references/checklist.md" })
  → that file's text
```

Long text returns a `continuation`; pass it back with the same `path` for the next page. A
continuation is signed for the agent, ID, revision and path, and each page is authorized again,
so an edit, revocation or another agent's token fails instead of serving stale bytes. Images come
back as attachments like `read`; other binaries only as a path. Content already delivered stays
in history.

**Scripts.** MauzCode never runs package content. Workspace packages are used in place. Server
and plugin packages are copied on read to `~/.cache/mauzcode/skills/<id>/<revision>/` on the
workspace host (local or SSH), keeping relative paths and executable bits, read-only, via a
staging directory and rename so concurrent readers never see a partial copy. Each edit makes a
new revision directory; old ones may be pruned by age. The agent runs scripts with its own
`bash`; reading a skill adds no tool and no permission. A revoked skill is hidden from
`read_skill`, but presets are not a sandbox: an earlier cached copy stays on disk until pruned.

## Invoking a skill from chat

Visible skills appear in the slash menu under **Skills**, built by the same server catalogue as
ordinary commands: a short name, a source label and the description. For a new chat the menu
uses the selected project and preset; changing either refreshes it. Search matches the short
name, the full ID and the source.

1. Type `/review`. The menu shows `review · Git` and `review · Workspace` as separate rows.
2. Pick `review · Git` with the pointer or arrows and Enter. The draft becomes
   `/skill.plugin.git:review ` and is shown as a `review · Git` chip; nothing is sent yet.
3. Type the task, e.g. `check my changes`, and send.

The message is kept exactly as typed. Before the turn is scheduled the server reads the skill as
that agent and records a completed `read_skill({ id })` call, so the first model turn already
has the instructions. A disabled or missing ID is rejected with no fallback to another skill
and no turn. A chat whose preset predates skill reading is told to open a new chat. Pasting
`/skill.plugin.git:review check my changes` works without the menu. In history the chip comes
from the stored event, so it stays readable and copyable (`/skill.plugin.git:review`) after the
plugin is removed. `/git:review` stays an ordinary command; declarations cannot claim `skill.`.

## Creator inventory

`skills.inventory({})` is for the built-in Creator only: the agent's snapshot and every stored
ancestor must be the `creator` preset; custom presets, even with `*` grants, are refused. It
lists every catalogue entry with an `enabled` flag, so a Creator can find the exact ID of a
disabled plugin export to put into `enabledPluginSkills`, and every server project branch with
the host and path from its `project.json`. A branch whose file is missing, or whose SSH alias is
no longer configured, is marked `orphaned`; it is never deleted. The inventory returns no
instructions or resources, and listing a disabled export does not make it readable.

## Adding a skill (Creator)

Only the built-in Creator is offered `add_skill` (`skills.add.prepare` and `skills.add.review`).
The agent asks for anything missing — source, destination, adaptation — then prepares a draft
and opens a review card. **Only the person's click in that card publishes**: a tool argument,
generic input submission or another chat cannot approve it.

Example: the person writes "add our review checklist as a skill for this project".

1. Creator asks: draft or import? workspace, this project on the server, or all projects?
2. `add_skill({ action: "prepare", source: "draft", destination: "serverProject", name: "review",
   description: "Review a diff against the team checklist.", instructions: "…" })` returns a
   `draftId`, the future ID `skill.server.project:review` and the file list. Nothing is saved.
3. `add_skill({ action: "review", draftId })` shows the ID, destination, source, files, the
   SKILL.md text and any adaptation diff, bound to the content digest. The agent ends its turn.
4. The person clicks **Add skill**. The server rechecks the Creator, workspace and digest,
   publishes atomically without replacing anything (a staging directory renamed with
   `RENAME_NOREPLACE`), then reads the new skill back through the catalogue and `read_skill`.
   Only then does the card say "Added and verified".

Sources: a new draft; a ready folder on the server or an SSH host (read-only, links and special
files refused); or one package from a **public** HTTPS Git repository, resolved to an immutable
commit. Git imports pin the resolved public address, send no credentials, follow no redirects,
run no hooks, filters or submodules, never check out, and stop past 64 MiB or 60 seconds.
Private repositories, `http:`, `ssh:`, `file:` and hosts resolving to private or loopback
addresses are refused. A repository with several packages returns them for the person to choose.

Imports keep the original bytes, paths, executable bits and license files. Rewrites (for
example `.claude/skills/…` paths to `.mauzcode/skills/…`) are passed as `adaptations` and shown
as a separate diff. The source folder or repository is never changed.

Recovery: **Cancel**, expiry (24 hours) or a changed draft publishes nothing. If the ID already
exists the card reports it and nothing is overwritten. If publication succeeded but verification
failed, the card says "saved but verification failed"; inspect the destination (for example
`ls <library>/projects/<project-id>/review`) and fix or remove it by hand — nothing is reinstalled
automatically. Drafts are stored owner-only in `<library>/.drafts/` and removed once handled.

## Not part of this layer

Package files,
including `scripts/example.ts`, stay inert data: nothing here imports or executes them.

## Tests

`src/skills/packageFiles.test.ts` builds every fixture in a private system temporary directory
and covers the header-only discovery, isolated malformed neighbours, both sides of each byte
limit, count and depth budgets, links on the anchor/package/resource, special files without
hanging, path traversal, an unsupported read and the absence of execution. Sizes at the megabyte
boundaries are sparse files, so the suite stays fast. Run it with the project runner:

```bash
bun script/test.ts fast ./src/skills/packageFiles.test.ts
bun script/test.ts fast ./src/skills/workspaceSource.test.ts
bun script/test.ts fast ./src/skills/sources.test.ts ./src/skills/access.test.ts ./src/skills/reading.test.ts ./src/skills/commands.test.ts
bun run frontend:test -- frontend/src/test/skill-commands.test.tsx
bun script/test.ts fast ./src/skills/authoring.test.ts
bun script/test.ts it ./src/skills/gitImport.it.test.ts
bun script/test.ts it ./src/skills/materialize.it.test.ts
bun script/test.ts it ./src/skills/workspaceSource.it.test.ts
```
