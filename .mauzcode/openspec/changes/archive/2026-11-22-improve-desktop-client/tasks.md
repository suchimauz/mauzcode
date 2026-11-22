# Tasks

## 1. Shell, settings and connection recovery

- [x] 1.1 Build the staged connection check in `desktop/` using `/auth/session`. Test signed-in and open-access sessions, then a 401 followed by successful same-origin login. Reject an HTTP 200 HTML placeholder, malformed or unrelated JSON, a missing endpoint, HTTP errors, timeout, unsafe redirects and invalid TLS. For every failed switch assert that the old chat stays open and its saved address survives restart.
- [x] 1.1a Test an OIDC-only fixture with no valid session: the sign-in redirects to an external provider. Verify the client explains the unsupported flow, offers a way back and keeps the original server and session. Document this pilot limit in `desktop/README.md`.
- [x] 1.2 Implement accessible first-run and settings screens with HTTPS, LAN/VPN and localhost examples, HTTP warning, server, permissions, version and update controls. Verify keyboard navigation, focus, labels and both color schemes.
- [x] 1.3 Preserve app identity, `server.json` and per-origin partitions; run an upgrade fixture that keeps an existing valid session while a different origin receives no credentials.
- [x] 1.4 Distinguish authentication, certificate, initial navigation, renderer and live-transport failures. Test drop/reconnect and explicit retry with a pending draft; assert the live UI resyncs without duplicate submissions or forced reload on a transient outage.
- [x] 1.5 Support tray restore, single instance, intentional quit and no-tray fallback. Extend lifecycle tests for unavailable tray and document first run/recovery in `desktop/README.md` against the actual menu labels.

## 2. Local files, permissions and notifications

- [x] 2.1 Implement user-initiated Save As for server downloads and page-generated exports. Test save, cancel, overwrite, transfer failure, filename sanitization, untrusted initiator and cross-origin redirect; confirm no automatic open.
- [x] 2.2 Implement origin-scoped microphone grant/revoke plus OS packaging declarations. Test HTTPS and loopback consent, active capture revocation, server switch, OS denial, blocked LAN HTTP, camera, mixed audio/video and iframe requests. Verify existing web dictation still works without a second audio path.
- [x] 2.3 Trace server transitions for finished runs and pending input; implement the minimal capability/occurrence contract using authenticated live events. Test ownership with two users, replay, and unsupported-server fallback; existing browser delivery must remain unchanged.
- [x] 2.4 Implement opt-in desktop notification delivery and notification-click routing. Test minimized/tray delivery, one alert per occurrence, opt-out, stale clicks after sign-out/switch and explicit quit; verify that a remote frame cannot invoke local settings or arbitrary IPC.
- [x] 2.5 Document Save As, dictation consent/revocation, secure-context limits and when alerts work; exercise each documented action using a fixture server and verify denial never prevents normal chat.

## 3. Verify packaging configuration and update behavior locally

- [x] 3.2 Add release manifest signing and client verification. With disposable test keys, accept a valid release and reject a replaced manifest, signature, digest, asset identity, architecture, channel and downgrade; verify Linux uses the signature rather than an adjacent checksum alone.
- [x] 3.3 Integrate electron-updater with verified metadata and platform signing checks; bind the bytes accepted for install to the verified manifest. Test check/download/Later/explicit restart, offline feed and failed verification with a fixture repository; ordinary quit after Later must not silently install.
- [x] 3.4 Write the distribution runbook for source CI versus the proposed public release-only repository, anonymous reads, least-privilege publishing, channels, signing, migration and recovery. Validate the configured packaging matrix and dry-run the release inventory with fixture entries and public-safe notes. Do not treat fixtures as an inspection of native installers.

## 4. Record verification results

- [x] 4.5 Record the local results and a per-target evidence table in `desktop/PILOT.md`. Mark each Windows, Linux and Mac architecture without installed evidence as unverified; do not publish or promote a release.

### Local verification

- Connection, settings, session migration, downloads, microphone and alerts: `desktop/*.test.ts`, `src/events/desktop*.unit.test.ts`, `src/procs/events/client.status.test.ts` and the frontend composer/voice/status tests. Fixtures use loopback HTTP/TLS, real files and authenticated session doubles. The settings screen was also exercised in Chromium with the keyboard and both color schemes. This does not certify native OS dialogs, hardware or a packaged binary.
- Updates and packaging: `desktop/updates.test.ts` stages signed fixture bytes with the locked AppImageUpdater; `desktop/package-policy.test.ts` validates the actual electron-builder configuration and public inventory policy. See `desktop/RELEASE.md` for the build procedure and `desktop/PILOT.md` for the four unverified targets.

### Scope decision: no installed pilot

The original five unchecked items were removed from this change, not marked as passed. Native testers are unavailable. This closes the implementation on local evidence only; it does not certify any platform or authorize distribution.

- **3.1:** The source packaging matrix exists and was checked under 3.4. No native installer inventory, architecture inspection, production signing or Apple notarization was verified.
- **4.1:** No public repository was created, no pilot versions were published, and anonymous access was not tested. Creating a repository and publishing releases still require separate approvals.
- **4.2–4.4:** No Windows x64, Intel Mac, Apple Silicon Mac or Linux x64 clean install, migration or installed N → N+1 update was tested. The per-platform checklist stays in `desktop/PILOT.md` for any future release decision; it is not backlog for this change.
