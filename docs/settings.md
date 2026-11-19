# Settings: declarations, instance files, database

One mechanism, three places a value can come from. Every key is **declared** once by the module that owns it;
the effective instance value follows the precedence below. Lower-priority values can still exist.

## 1. Declare a key — `$setting_<key>.ts` (code, owned by the module or plugin)

```ts
// src/nav/$setting_pages.ts          → key nav.pages
// ~/.mauzcode/user/hetzner/src/hetzner/$setting_projects.ts → key hetzner.projects
export default {
    type: "json",          // string | text | number | boolean | enum | json | secret
    default: undefined,    // value when nothing else sets it
    title: "Menu pages",
    description: "What it does, what values mean, where it is usually set.",
    // env?: "MAUZCODE_X", options?: [...] (enum), min?/max? (number)
};
```

Core modules and plugins (official and user) declare keys the same way; the key is `<namespace>.<file name>`.
A plugin declares only its own namespace. Describe the meaning of the value in `description` — the settings
page and agents read it.

## 2. Fix a value for the instance — `$settings_<module>.json` (files of this instance)

```
~/.mauzcode/settings/                 # env MAUZCODE_SETTINGS overrides the directory
  $settings_nav.json               # { "pages": ["search", "settings", "plugins"] }
  $settings_hetzner.json           # { "projects": [...] }
```

- One file per module, one directory per instance (atomic, exec, a laptop each have their own). It is
  configuration, not code: keep it out of plugin folders; it may be its own git repo or backup.
- The file must be a JSON object of setting keys and values. Keys must be declared by a `$setting_` file.
  An undeclared key is a warning; a rejected value is an error; either way that key is ignored.
  `string`, `number`, `boolean` and `enum` values are checked against their declared type/options;
  `text` and `json` accept any JSON value at this layer, not a consumer-specific schema.
  `secret` keys are never accepted from files — use encrypted secret storage.
- Edits apply without a restart (the directory is re-checked at most once a second). A file with broken JSON
  keeps its last good values and reports an error. `ctx.fns.settings.files({ force: true })` shows the values,
  their file paths, errors and warnings.
- A value given by a file is **the** instance value: `settings.set` for that key at scope `global` throws
  ("fixed by <path>"), and the settings page (`/settings/declared`) shows it read-only with source `file: …`.
  To change it, edit the file; to hand it back to the UI, delete the key from the file. Any existing database
  value then becomes effective before env/default. `settings.remove` only deletes the database row; it does
  not remove or unlock a file value.

## 3. Everything else — the database (UI, `settings.set`)

Resolution for `settings.get({ module, scopeType: "global", key })` (no `scopeId`, or an empty one):

1. instance file `~/.mauzcode/settings/$settings_<module>.json`
2. database row (set from the UI or `settings.set`)
3. `env` named in the declaration
4. declared `default`

Other scopes (`user`, `agent`, `provider`, …) read their own database rows; instance files, env and declared
defaults do not apply to them. `settings.get` does not automatically fall back from a user scope to global.
The consumer decides whether to do that. For `nav.layout` and `dock.layout`, the effective-layout readers
try the signed-in person's user value first: a valid layout replaces the instance layout **as a whole**,
not by merging fields. Without a valid user layout they read global, then use an empty layout as fallback.
Thus a file-fixed global layout does not prohibit personal overrides.

## Examples

### Pages widget, not the whole application menu

`nav.pages` is an ordered list read by `src/nav/$widget_pages.ts`. It selects items **only for that widget**
from `nav.items({ includeAgents: false, limit: 500 })`, after the widget's group filtering. Its `daily` or
`management` section filter still applies. `[]` shows no items in that widget; unknown or filtered-out ids
are skipped. With no array configured, the widget uses core (non-plugin) items in their declared order;
without a section filter, administration items are grouped separately.

A page id is the `<name>` of its `$app_<name>.json`: `src/auth/$app_people.json` → `people`,
`src/cron/$app_cron.json` → `cron` (the declared `/cron` destination still exists).
For example, in `~/.mauzcode/settings/$settings_nav.json`:

```json
{ "pages": ["search", "settings", "plugins", "people", "cron"] }
```

List registered ids with `Object.keys(ctx.state.nav.apps)`. This is the registry, not a guarantee that every
id survives the widget's filtering. `nav.items` itself does **not** read `nav.pages`; React Applications
uses that destination list independently. This setting is neither an Applications allowlist nor a way to
configure the React sidebar. Hiding an item never blocks access to its route.

**A plugin's own setting** — declare `~/.mauzcode/user/lisboalive/src/lisboalive/$setting_home.ts`, then fix it
for the instance in `~/.mauzcode/settings/$settings_lisboalive.json` as `{ "home": "Cascais" }`.

### Disabled model providers — `models.disabledProviders`

`models.disabledProviders` (`src/models/$setting_disabledProviders.ts`, `type: "json"`, default `[]`)
is the instance-wide set of provider ids the owner took out of service. The Models settings tab
writes it through the owner-only `setProviderEnabled` API action (serialized, idempotent); every
inference request, route resolution, provider action, connection test/usage, model discovery and
creation checks it and refuses with `PROVIDER_DISABLED` before any network request. Connections
and secrets are kept; re-enabling restores everything. Validation checks shape only — ids of
unregistered providers are stored and take effect when the provider loads. Fixing the value in
`~/.mauzcode/settings/$settings_models.json` (e.g. `{ "disabledProviders": ["codex"] }`) makes the
UI switch read-only (`enabledLocked`) and `settings.set` fail with `SETTING_FIXED`. Details:
[models-providers.md](models-providers.md#global-provider-switch--modelsdisabledproviders).

### Default voice route — `voice.defaultRoute`

`voice.defaultRoute` (`src/voice/$setting_defaultRoute.ts`, `type: "string"`, default `""`) is the
`provider/accountName:modelId` voice route a chat uses for live dictation when it has no saved
override; an empty value means voice dictation is not configured. The descriptor validates syntax
only (with fixed text, never echoing the value) — registration, the stored connection and the model
are checked by `voice.resolveRoute`, which never falls back to another route. A chat's own override
lives in its scratchpad key `voice.route` and is managed through `voice.route.setOverride` /
`clearOverride`, not through settings. In the UI the owner sets the default in **Settings → Voice**
(read-only there when an instance file fixes it) and a chat's override from the voice route button
in its composer footer; both accept only a route that resolves when saved. This key is separate from `models.*`: a voice connection and
a Models connection are distinct records even when they hold the same vendor key. Setup, options,
billing and the provider declaration guide: [voice-providers.md](voice-providers.md).

### Model retries — `agent.retryPolicy`

`agent.retryPolicy` (`src/agent/$setting_retryPolicy.ts`) decides how often a failed model request is
repeated before the turn gives up. Generation has no side effects — tools run only after a complete reply,
and a partial reply is discarded — so repeating an interrupted generation costs tokens while stopping it
costs the user's work.

```json
{
  "maxRetries": 5,
  "initialDelayMs": 1000,
  "maxDelayMs": 60000,
  "jitterRatio": 0.2,
  "retryableCodes": ["TRANSPORT", "STREAM_INTERRUPTED", "PROVIDER_ERROR"],
  "providers": { "codex": { "maxRetries": 2 } }
}
```

- `maxRetries` counts retries of one model request, not of a turn. `providers` overrides apply by the
  connection's provider id (`claude`, `codex`, `custom`, …); its fields merge over the global ones.
- `retryableCodes` can only **narrow** the built-in allowed set. A code waiting cannot fix — `AUTH`,
  `INVALID_INPUT`, `QUOTA_EXHAUSTED`, `OVERFLOW`, `CANCELLED`, a disabled model, proxy
  configuration/TLS/auth, permanent SSH — is never retried, and `settings.set` rejects it.
- A code being allowed is necessary but not sufficient: the failure itself must not be marked
  non-retryable by the code that raised it (`SERVER` 503 retries, `SERVER` 501 does not).
- A Retry-After longer than `maxDelayMs` parks the agent until that moment (at most 30 minutes) instead
  of failing the turn; it resumes the same work by itself.
- Edit a value fixed by a file in that file (`ctx.fns.settings.files({})` shows which), not through the UI.

## Layout settings: instance files and surviving consumers

`nav.layout` and `dock.layout` already use the same file → database → env → default resolution as other
global settings. Their declarations have `type: "text"`, env names `MAUZCODE_NAV` / `MAUZCODE_DOCK`, and
an empty-string default. The file validator accepts JSON objects for `text`, and both effective-layout
readers accept either an object or a string containing JSON. No migration is needed to use instance files.

For example, `~/.mauzcode/settings/$settings_nav.json` can contain this object-valued layout (alongside
`pages`, if desired):

```json
{
  "layout": {
    "version": 1,
    "tabs": [{ "id": "home", "title": "Home" }],
    "hidden": [],
    "searchHidden": []
  }
}
```

An equivalent string-valued form is also supported:

```json
{ "layout": "{\"version\":1,\"tabs\":[{\"id\":\"home\",\"title\":\"Home\"}],\"hidden\":[],\"searchHidden\":[]}" }
```

For `~/.mauzcode/settings/$settings_dock.json`:

```json
{ "layout": { "top": [], "bottom": [], "hidden": [], "pins": ["/settings"] } }
```

These are configuration examples, not a promise to rearrange the current React shell:

- `nav.effectiveLayout` → `nav.tabs` → `frontendBridge.searchData` remains a live structured-data path for
  tabs, widget placements and search sources. `nav.tabs` resolves configured entries against the loaded
  registries, includes remaining declared tabs and applies hidden lists; listing one tab is not an allowlist.
- `dock.effectiveLayout`, `dock.pin`, `dock.saveLayout` and the Dock routes still consume/persist layouts and
  pins. Saving uses the viewer's user scope, or global without a viewer; resetting deletes that scope's
  database row. A file-fixed global value still wins after a global reset, and a global save is rejected.
  These retained operations do not establish that `dock.layout` controls the React sidebar.
- The former navigation/dock/chat shell is removed. The remaining `ui.layout` is a minimal server-document
  renderer, not that shell. React owns the primary UI, while necessary server documents and compatibility
  transports remain. See [UI architecture](ui-architecture.md) for the consumer map.

Layout parsing is separate from file validation: malformed JSON strings or non-object layouts are ignored
by the effective-layout readers, which then try the next scope/fallback. They do not retry lower-priority
global database/env values if a file value was selected by `settings.get` but is unusable as a layout.
