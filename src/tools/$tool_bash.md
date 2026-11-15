---
description: >-
  Run a shell command via `bash -c`. Runs in the agent's workspace unless cwd says otherwise.
  Returns stdout; a non-zero exit returns [exit N] with stderr, and a command that outruns
  timeout is killed and reported with whatever it printed.
marker: bash
promptSnippet: "run shell commands (rg, jq, git, tests)"
promptGuidelines:
  - "To work on another machine pass host (an alias from ~/.ssh/config, list with ctx.fns.remote.servers({})) to bash, read, write or edit — no ssh quoting needed; the connection is kept open between calls."
  - "Give bash a timeout when a command could hang (a server, a watcher, a prompt) — and make it generous: a slow search needs minutes, and a timeout that is too tight kills work that was about to succeed."
  - "Prefer rg for text search and rg --files -g '<glob>' for file discovery through bash; scope searches to the relevant directory and bound output. Keep .gitignore filtering unless ignored files are explicitly needed; avoid broad shell find walks. Use the grep/find tools when their structured options or hashline edit anchors are useful."
  - "Prefer jq to select, filter and summarize JSON in shell pipelines before returning it to the model; do not dump large JSON blobs or parse JSON with grep/sed."
  - "If rg or jq is unavailable on the execution host, use an alternative: grep/find tools for search, or Bun/Node/Python JSON parsing for jq. Check command -v when needed; do not repeatedly retry a missing command or install software without permission. rg exit 1 means no matches, not a missing command."
parameters:
  type: object
  properties:
    host:
      type: string
      description: "SSH server alias from ~/.ssh/config (list: ctx.fns.remote.servers({})), or \"local\". Omit to run in the agent workspace — local, or remote when the workspace has a host (then cwd defaults to the workspace dir). Remote commands run via bash -lc over a persistent connection."
    command:
      type: string
      description: "Shell script to run."
    cwd:
      type: string
      description: "Directory to run in. Relative paths resolve against the workspace. Defaults to the workspace."
    env:
      type: object
      description: "Extra environment variables, merged over the server's own environment."
      additionalProperties:
        type: string
    secrets:
      type: object
      description: "Secret environment variables. Values must be op://, env:// or secret://namespace/name references (the latter written by secrets.set or secureInput.prompt({ saveAs })); resolved values are redacted from output."
      additionalProperties:
        type: string
    timeout:
      type: integer
      description: "Seconds before the command is killed. No timeout by default."
    rtk:
      type: boolean
      description: "Pass false to run this local command without automatic RTK output compression (only matters when the owner enabled RTK). Omit otherwise; true does not enable RTK."
  required: [command]
  additionalProperties: false
---
### `§bash`

- Runs the body as a shell script via `bash -c`, in the workspace directory.
- `secrets` maps environment variable names to `op://`, `env://` or `secret://namespace/name` references. Values are injected only into the child process and redacted from captured output. A `secret://` entry is created with `secureInput.prompt({ title, saveAs: "secret://ns/name" })` (the human types it, the model only sees the reference) or `secrets.set({ ref, value })`.
- stdout comes back as the result; a non-zero exit returns `[exit N]` with stderr.

Example:

```ts
await ctx.fns.tools.bash({
  command: 'curl -H "Authorization: Bearer $TOKEN" https://api.example.com/me',
  secrets: { TOKEN: 'op://vault/item/field' },
  timeout: 30,
});
```

The model-visible command contains only `$TOKEN` and the secret reference. The resolved value exists in the child process environment and occurrences in captured stdout/stderr are replaced with `[REDACTED]`. `secrets` overrides variables with the same name from `env`.

This prevents accidental transcript leakage, not malicious exfiltration: the invoked program can still read the environment and send it over the network. Do not use `set -x`, place secret values in command arguments, or print the environment.
- The marker form takes no options — use the `bash` tool call for cwd / env / secrets / timeout.

### Optional RTK compression (local calls only)

When the official `rtk` plugin is loaded and the owner enabled it in Settings → Plugins, a local bash call (no `host`, or `host: "local"`, in a local workspace) is first passed to `rtk rewrite` as one argument — RTK never runs your command during this step. SSH hosts and remote workspaces are never touched.

- Exit 0 or 3 with a replacement: the `rtk …` equivalent runs once, with compressed output. Exit 3 does not ask for an extra confirmation: the host's (MauzCode's) own approvals are the authority, and Claude Code `ask` rules in RTK/Claude settings are not a separate MauzCode barrier. Exit 0 is not an authorization grant either.
- Exit 1: the original runs once.
- Exit 2: denied by RTK rules — nothing runs and the result says so.
- Technical failure before start (crash, signal, timeout, overflow, unknown or malformed response): RTK is disabled instance-wide with a reason, the original runs once and the result starts with a short `[rtk: disabled automatically …]` notice. Only the owner can re-enable it after a fresh check.
- Preparation counts toward `timeout`; if the deadline passes first nothing runs.
- Once a command started it is never retried or re-run, whatever happens to it. Tool details show the original and the executed command (secrets masked).
- `rtk: false` skips RTK for that call only (prospective): use it when you need full, unfiltered output. A previous compressed result is never replayed automatically; re-running is your own decision. A command that itself calls `rtk` still runs as written.
