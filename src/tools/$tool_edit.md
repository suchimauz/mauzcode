---
description: >-
  Edit a file you have read. Pass the readId from the first line of the read result, a mode, and
  the edits. mode literal: oldText/newText replacements — oldText must appear exactly once in the
  lines you read, unless all is set. mode anchor: line ops addressed by the anchors of a hashline
  read. The result starts with a status — applied, conflict, invalid, expired or busy — and carries
  a new readId; on conflict it also carries the current content of the same lines.
marker: edit
validate: tools.editValidate
promptSnippet: "edit files in place"
promptGuidelines:
  - "Read the target range before editing; pass its readId and use hashline for anchor edits. If the file changed, review fresh content before retrying; never overwrite concurrent changes."
  - "Copy literal oldText exactly and uniquely. Batch changes to one file in one edit; use its returned readId for the next edit."
presentation:
  label: Edit
  icon: file-edit
  category: files
  summary: "@edit"
parameters:
  type: object
  properties:
    readId:
      type: string
      description: "The readId from the first line of a read result (or of a previous edit result). Names the file, host and version."
    mode:
      type: string
      enum: [literal, anchor]
      description: "literal: every edit has oldText/newText. anchor: every edit has op and anchor (from a hashline read). Required with readId."
    path:
      type: string
      description: "Optional with readId (must name the same file)."
    host:
      type: string
      description: "SSH server alias from ~/.ssh/config (list: ctx.fns.remote.servers({})), or \"local\". Omit to act in the agent workspace — local, or remote when the workspace has a host. On the workspace host relative paths resolve against the workspace dir; on other hosts against the remote home."
    edits:
      type: array
      description: "Changes to apply, all of one mode. Each is matched against the file as it was read, not against the result of the previous one."
      items:
        type: object
        properties:
          op:
            type: string
            enum: [replace, replaceLines, insertBefore, insertAfter, delete]
            description: "mode anchor: replaceLines, insertBefore, insertAfter or delete. mode literal: omit (replace)."
          oldText:
            type: string
            description: "mode literal — exact text to find, as read shows it (LF line breaks). Must match once in the lines read, unless all is true."
          newText:
            type: string
            description: "mode literal — text to put in its place. Empty string deletes it."
          all:
            type: boolean
            description: "mode literal — replace every occurrence in the lines read instead of requiring exactly one."
          anchor:
            type: string
            description: "mode anchor — an anchor from a hashline read, inside the lines read. BOF/EOF work for inserts."
          endAnchor:
            type: string
            description: "mode anchor — last anchor of the range, for replaceLines and delete."
          text:
            type: string
            description: "mode anchor — the replacement or inserted lines."
        additionalProperties: false
  required: [edits]
  additionalProperties: false
---
Statuses (first line of the result):

- `applied` — written; the result has a new `readId` and the edited lines, ready for the next edit.
- `conflict` — the file changed since it was read; nothing was written. The current content of the
  same lines and a new `readId` follow — redo the edit against them.
- `invalid` — the request was wrong (mixed modes, an anchor outside the lines read, oldText found
  0 or several times, a no-op, overlapping edits); nothing was written.
- `expired` — the readId is unknown, expired (30 minutes), from another session, or lost on
  restart; nothing was written. Read again.
- `busy` — another MauzCode writer holds the file lock; nothing was written. The message names the
  lock directory and its owner.

Line endings, the final newline and a BOM are kept; lines you do not touch keep their bytes. The
lock coordinates MauzCode writers only — `bash`, direct fs calls and editors do not take it.
