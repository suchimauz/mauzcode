# Tasks

## 1. Shell, settings and connection recovery

- [ ] 1.1 Build the staged connection check in `desktop/` using `/auth/session`. Test signed-in and open-access sessions, then a 401 followed by successful same-origin login. Reject an HTTP 200 HTML placeholder, malformed or unrelated JSON, a missing endpoint, HTTP errors, timeout, unsafe redirects and invalid TLS. For every failed switch assert that the old chat stays open and its saved address survives restart.
- [ ] 1.1a Test an OIDC-only fixture with no valid session: the sign-in redirects to an external provider. Verify the client explains the unsupported flow, offers a way back and keeps the original server and session. Document this pilot limit in `desktop/README.md`.
- [ ] 1.2 Implement accessible first-run and settings screens with HTTPS, LAN/VPN and localhost examples, HTTP warning, server, permissions, version and update controls. Verify keyboard navigation, focus, labels and both color schemes.
- [ ] 1.3 Preserve app identity, `server.json` and per-origin partitions; run an upgrade fixture that keeps an existing valid session while a different origin receives no credentials.
- [ ] 1.4 Distinguish authentication, certificate, initial navigation, renderer and live-transport failures. Test drop/reconnect and explicit retry with a pending draft; assert the live UI resyncs without duplicate submissions or forced reload on a transient outage.
- [ ] 1.5 Support tray restore, single instance, intentional quit and no-tray fallback. Extend lifecycle tests for unavailable tray and document first run/recovery in `desktop/README.md` against the actual menu labels.

## 2. Local files, permissions and notifications

- [ ] 2.1 Implement user-initiated Save As for server downloads and page-generated exports. Test save, cancel, overwrite, transfer failure, filename sanitization, untrusted initiator and cross-origin redirect; confirm no automatic open.
- [ ] 2.2 Implement origin-scoped microphone grant/revoke plus OS packaging declarations. Test HTTPS and loopback consent, active capture revocation, server switch, OS denial, blocked LAN HTTP, camera, mixed audio/video and iframe requests. Verify existing web dictation still works without a second audio path.
- [ ] 2.3 Trace server transitions for finished runs and pending input; implement the minimal capability/occurrence contract using authenticated live events. Test ownership with two users, replay, and unsupported-server fallback; existing browser delivery must remain unchanged.
- [ ] 2.4 Implement opt-in desktop notification delivery and notification-click routing. Test minimized/tray delivery, one alert per occurrence, opt-out, stale clicks after sign-out/switch and explicit quit; verify that a remote frame cannot invoke local settings or arbitrary IPC.
- [ ] 2.5 Document Save As, dictation consent/revocation, secure-context limits and when alerts work; exercise each documented action using a fixture server and verify denial never prevents normal chat.

## 3. Build and verify update artifacts

- [ ] 3.1 Extend the source repository's packaging matrix to NSIS x64, DMG plus ZIP for both macOS architectures, and Linux x64 AppImage. Verify package inventory, architecture and embedded build-pinned repository/channel; no server runtime, credential or internal URL in the distribution. Verify Developer ID signing and notarization for each pilot DMG and app before the installed macOS checks.
- [ ] 3.2 Add release manifest signing and client verification. With disposable test keys, accept a valid release and reject a replaced manifest, signature, digest, asset identity, architecture, channel and downgrade; verify Linux uses the signature rather than an adjacent checksum alone.
- [ ] 3.3 Integrate electron-updater with verified metadata and platform signing checks; bind the bytes accepted for install to the verified manifest. Test check/download/Later/explicit restart, offline feed and failed verification with a fixture repository; ordinary quit after Later must not silently install.
- [ ] 3.4 Write the distribution runbook for source CI versus the proposed public release-only repo, anonymous reads, least-privilege publishing, channel conventions, signature prerequisites, migration and recovery. Dry-run a prerelease inventory; check public notes and artifacts for accidental source, credentials or internal settings.

## 4. Installed pilot acceptance

- [ ] 4.1 Obtain separate approvals for creating the public release-only repository and publishing the test prereleases, then verify N and N+1 assets are anonymously readable there, marked prerelease, and not selected by the stable channel. Stop at the approval boundary if not authorized.
- [ ] 4.2 Run the full pilot journey on Windows x64 NSIS; record OS, package versions, outcome of every step below and actual installed N+1 version.
- [ ] 4.3 On clean Intel and Apple Silicon Macs, download the public pilot DMG in a browser, install the app, and open it normally with Gatekeeper enabled and download quarantine intact. For each architecture record the OS, release asset and whether the connection screen opens without an override. Only after it passes, run the rest of the journey with compatible N and N+1 signing identities; record the installed update version separately. A blocked or untested first launch leaves that architecture unverified.
- [ ] 4.4 Run the same journey on a named Linux x64 desktop distribution from an installed, writable AppImage; record distribution, prerequisites and behavior with and without a usable tray.
- [ ] 4.5 Publish no stable release as part of the pilot. Compile the platform evidence table, including gaps, macOS first-launch results and the separate stable distribution gate; mark a target verified only when its installed checks pass.

For tasks 4.2–4.4 use a clean client machine without MauzCode/Bun/Postgres: install → enter server address → sign in → open chat → disconnect/reconnect → export or cancel → dictate, deny and revoke microphone → receive both notification types in the background and return to the correct chat → defer, then apply a real N to N+1 update. Verify retained address and valid session, rejected invalid TLS, unavailable GitHub, and rejection of tampered updates without changing the installed version. Also exercise the one-time manual migration from the legacy package on platforms where it existed. Record failures and untested cases explicitly, without collecting credentials or chat contents.
