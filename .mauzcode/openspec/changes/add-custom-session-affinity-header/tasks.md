## 1. Affinity value

- [ ] 1.0 Add an `ifAbsent` option to `secrets.putLocal` that inserts without overwriting an existing entry (`ON CONFLICT DO NOTHING`); test it
- [ ] 1.1 Add a procedure under `models.provider.custom` that returns the 32-hex HMAC-SHA256 value for `{ connectionId, key }`, reading or lazily creating the installation salt in the local encrypted secret store and caching it in memory; create with `putLocal({ ifAbsent: true })` and always re-read with `getLocal` before caching
- [ ] 1.2 If the salt cannot be read (missing or undecryptable), generate a new one and overwrite the entry; if writing fails, return no value and log a single warning

## 2. Custom provider

- [ ] 2.1 Add the boolean `sessionAffinity` field ("Send session affinity header", default true, help text stating that a stable per-conversation identifier is sent to the endpoint and how to turn it off) to `$modelProvider_custom.ts`
- [ ] 2.2 In `customStream`, when the field is not `false`, add `x-session-affinity` derived from `req.promptCacheKey || req.sessionId` to a copy of the endpoint headers; leave `customEndpoint`, discovery and test unchanged
- [ ] 2.3 Update JSDoc of the touched procedures and regenerate types; validate with `runtime.docs.validate` and one project typecheck

## 3. Tests

- [ ] 3.1 Header present, 32 lowercase hex, not containing the raw id, for each of the four protocols
- [ ] 3.2 Stable for the same connection + key (including after clearing the in-memory salt cache); differs across connections and keys; falls back to session id
- [ ] 3.3 Absent when the field is false; present when the field is missing
- [ ] 3.4 Absent on model discovery and connection test requests
- [ ] 3.5 The same `promptCacheKey` gives the same header and a different one gives a different header (fork lineage itself is already covered by `cacheRoot.test.ts`)
- [ ] 3.6 Two concurrent first calls produce one stored salt and the same value; an undecryptable salt is replaced by a new one
