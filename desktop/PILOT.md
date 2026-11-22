# Desktop client verification — no public distribution

The `improve-desktop-client` change covers implementation and local verification only. No signed or notarized installer was produced, no public prerelease was published, and no clean-machine install or native N → N+1 update was tested. A dash means **not tested**; passing local checks does not verify a platform.

| Target | OS/build, asset, signer, versions | Clean install / migration | Public DMG browser download + normal Gatekeeper first launch | Native journey | Installed N+1, address/session retained | Status |
|---|---|---|---|---|---|---|
| Windows x64 NSIS | — | — | n/a | — | — | Unverified |
| macOS Intel DMG + ZIP | — | — | — | — | — | Unverified |
| macOS Apple Silicon DMG + ZIP | — | — | — | — | — | Unverified |
| Linux x64 AppImage (distro not tested) | — | — | n/a | — | — | Unverified |

**Fixture-only dry run:** `cd desktop && bun test ./package-policy.test.ts` exercises all six expected names, both signature sidecars, exact public-safe notes, missing and extra files, ASAR first-party allowlist and invalid build pins. A separate synthetic dry run signed four non-executable fixture inputs with an ephemeral test key, checked all nine staged entries and rejected a modified installer fixture. No real inventory, independent signer verification, anonymous download, binary inspection or credential scan of final artifacts is claimed. Public repository, approved pins, credentials, native build machines and independent installed evidence are external prerequisites.

## Local checks (not installed acceptance)

- `cd desktop && bun run test && bun run check`: 132 tests passed and all four JS entry points bundled. The tests validate the native matrix against the pinned electron-builder schema and stage signed fixture bytes with the actual AppImageUpdater library. Electron windows, system dialogs, microphone hardware and installation were not exercised.
- `bun run test`: 4,201 fast tests passed against isolated test Postgres. `bun run frontend:build` passed. Full frontend tests: 1,127 passed, one `codex-picker` cold-catalogue test failed. The same test failed on the unchanged starting commit.
- The complete root typecheck passed with the bundled `opencode-go` plugin included when generating declarations. Without it, the clean worktree’s default declarations produce four missing-`opencodeGo` diagnostics from an existing core test importing that plugin. Neither the host configuration nor the plugin was changed.

## Checklist for a future release decision

These checks are not outstanding tasks for `improve-desktop-client`. Use them only if an installed pilot is separately approved. For each target record test date, OS/version and architecture, exact release filenames and checksums, versions shown before/after restart, public signer identifier, tester/evidence reference and pass/fail/untested per step. Use clean machines without development/server tooling. Never record credentials, cookies, internal URLs, server logs or chat/microphone contents.

1. Verify signatures and clean install. Where a legacy package existed, separately install the first pilot manually over it; confirm retained address and valid origin-partitioned session. On *each* Mac independently download the public notarized DMG in a browser, leave quarantine and Gatekeeper intact, install and launch normally, and record whether the connection screen opens without override. This must pass **before** testing that architecture's separate N → N+1 update.
2. Connect, same-origin login, open chat, disconnect/reconnect, reject invalid TLS. Export/download and cancel. Dictate, deny, revoke mid-capture, switch origin. Receive both notification types in background, return to correct chat. Verify window/tray accessibility; Linux also test no tray and record distro, writable AppImage location and runtime prerequisites.
3. Test offline GitHub and tampered metadata/artifact/signature: no install and no change to running version. Discover the real newer matching architecture/channel, defer during chat, then explicitly restart and install. Record actual N+1 installed version and retained server/session; normal quit while deferred must not install. Record failures, not just successful attempts.
4. **Stable gate remains closed.** Even complete pilot results would not authorize stable. Review separate broad Windows distribution/signing and reputation concerns, support and rollback; obtain a new release decision. No publication, stable promotion or security-control bypass.

## Integrated shell manual check (`desktop-integrated-shell`)

Run on Windows 11, Linux (GNOME on Wayland and an X11 session; record distro and WM) and macOS. Record OS/version, pass/fail per step.

1. Title strip: no File/Edit/View bar (also after pressing `Alt` on Windows/Linux); strip and window controls match the light and dark theme and recolour when the theme is switched in MauzCode settings; drag moves the window, double-click maximises; snap layouts work on Windows.
2. `⋯` in the strip (Windows/Linux) opens Settings, Retry, Back, Reload, Zoom, Fullscreen, Quit; `Ctrl+,`, `Ctrl+R`, `Ctrl+Shift+R`, `Alt+←`, zoom and `Ctrl+Q` work with the bar hidden.
3. Right-click: copy selected chat text; cut/copy/paste/select all in the composer; open (with confirmation) and copy an `https` link; copy an image; no menu on empty space.
4. Switch between several agents repeatedly on a remote server: no «Связь потеряна» / «Связь восстановлена». Disconnect the network for >2 s: the loss banner appears; reconnect: «Связь восстановлена» appears and disappears.
5. Settings window: product colours and grouped rows; dark when the server theme is dark even with a light OS theme; system appearance before any server theme is known.
6. Older server (without the title strip): a draggable strip is still present and window controls do not cover page controls.
Known risk: `titleBarOverlay` may render imperfectly on some Linux window managers; record the result rather than working around it.
