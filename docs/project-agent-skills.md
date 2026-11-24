# Project agent skills

A **skill** is a portable Agent Skills package: a directory whose `SKILL.md` opens with a
YAML frontmatter block and continues with Markdown instructions. This page documents the
bounded local reader that discovers and reads such packages — its limits, what happens at a
boundary, and where it refuses to work. It is data handling only: no package content is
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
unsafe fallback. A remote source is a separate transport concern and is not part of this
layer.

## Not part of this layer

No SSH or network transport, no grant or enablement policy, no cache, no publication and no
inventory UI. Separating package data from runtime registration is its own step of the change;
this layer only guarantees the part it can test here: nothing it reads is ever imported or
executed, and a package's `scripts/example.ts` stays inert data.

## Tests

`src/skills/packageFiles.test.ts` builds every fixture in a private system temporary directory
and covers the header-only discovery, isolated malformed neighbours, both sides of each byte
limit, count and depth budgets, links on the anchor/package/resource, special files without
hanging, path traversal, an unsupported read and the absence of execution. Sizes at the megabyte
boundaries are sparse files, so the suite stays fast. Run it with the project runner:

```bash
bun script/test.ts fast ./src/skills/packageFiles.test.ts
```
