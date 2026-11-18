---
description: >-
  Create a new file (mode create, path, content — refused if it exists) or replace a file you have
  read whole (mode replace, readId from a complete read, content — refused if it changed since).
  Use edit for targeted changes to an existing file. The result starts with a status — applied,
  conflict, invalid, expired or busy — and carries a readId for the written file.
marker: write
promptSnippet: "create files or rewrite them whole"
presentation:
  label: Write
  icon: file-plus
  category: files
  summary: "{path}"
parameters:
  type: object
  properties:
    mode:
      type: string
      enum: [create, replace]
      description: "create: a new file at path. replace: the file named by readId, which must come from a read of the whole file."
    readId:
      type: string
      description: "mode replace — the readId of a complete read of the file."
    host:
      type: string
      description: "SSH server alias from ~/.ssh/config (list: ctx.fns.remote.servers({})), or \"local\". Omit to act in the agent workspace — local, or remote when the workspace has a host. On the workspace host relative paths resolve against the workspace dir; on other hosts against the remote home."
    path:
      type: string
      description: "mode create — file path to create. Optional with readId (must name the same file)."
    content:
      type: string
      description: "Full file body, written verbatim."
  required: [content]
  additionalProperties: false
---
- `create` never overwrites: an existing path answers `conflict`; read it and use `replace` or edit it.
- `replace` with a range readId answers `invalid`; read the whole file first.
- `replace` after the file changed answers `conflict` with the current content and a new readId.
- For .ts/.js files the result warns you if the written file does not parse — fix it immediately.
- Writes are atomic (temp file + rename) under a per-file lock shared by MauzCode writers only.
