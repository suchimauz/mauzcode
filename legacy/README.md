# Retired runtime sources

This archive preserves the former source-relative layout under `legacy/src/` and
historical parity tests under `legacy/tests/`. It is outside every runtime scan
root. Nothing here is a production fallback, route, setting, hook or compactor.
Do not add this directory to runtime discovery or generated context declarations.

The archived files were moved without changing their bytes. Some historical tests
refer to helpers that remain in the live tree; they are evidence, not an active
test suite. Use the normal `bun run test` entrypoint (src/plugins/script), not
recursive discovery of archived tests. Active retirement guards live in
`src/models/noLegacyCalls.test.ts` and `src/models/legacyRetirement.test.ts`.

Applied database migrations and legacy tables remain intact. Their archived
migration sources are not re-registered and no down migration is run by retirement.
See `docs/models-providers.md` for the replacement runtime and
`docs/mauzcode-node.md` for deployment verification scope.
