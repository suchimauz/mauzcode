# Design

## Context

See `proposal.md` for the motivation. `desktop/main.cjs` currently persists `server.json` and destroys the old window *before* the candidate loads. `desktop/navigation.cjs` treats initial HTTP errors as connection failures. The client already uses a sandbox, a local setup preload, origin-specific persistent Chromium partitions, and a single-instance lifecycle. The web UI already has sign-in, live reconnection and dictation. Packaging currently targets NSIS and DMG without an update feed. Existing tests do not establish installed behavior on any target OS.

## Goals / Non-Goals

Keep server state and web workflows on the server; the shell owns connection selection, native permissions, window lifecycle and verifying its own binaries. No multi-server workspace, local agent, offline queue, camera, third-party OAuth redesign, background delivery after Quit, or public stable release in this pilot. Do not change browser users' notification or dictation behavior.

Acceptance stops at the source packaging configuration and local checks of the client, including update staging against a signed fixture feed. It does not require building or signing installers, distributing a prerelease or recruiting testers. `desktop/PILOT.md` distinguishes this evidence from what would be required to call a platform pilot-ready.

## Decisions

### 1. Stage a candidate, then switch

Keep the application identity, user-data location, `server.json` format and current origin-to-partition mapping. Show examples, validation and the HTTP warning in the local setup/settings window. Reject URLs with embedded credentials, queries or fragments. Open the candidate in a restricted window; preserve the current window and saved address until the switch succeeds.

Check the main-frame URL, TLS and UI load. From the candidate's own Chromium session, request same-origin `GET /auth/session` with `Accept: application/json`. Expect the MauzCode session JSON: HTTP 200 with `authenticated: true` (including legacy sessions), or `authenticated: false` and `required: false` for open access. A generic 200 HTML page, unexpected JSON or a missing endpoint cannot confirm the server. Explain the mismatch; do not fall back to a page title or a successful navigation. This is a compatibility check, not cryptographic server identification over HTTP.

A session JSON response with HTTP 401 and `authenticated: false` means sign-in is needed, not that the network failed. Show the same-origin login in the candidate window; repeat the check after login. If login requires leaving the origin for an OIDC provider, explain the pilot limitation and offer to go back. An external browser login does not establish a session in the desktop partition. Surface other 403/404/5xx errors as such. Only after both the session check and UI load succeed, atomically save the address, promote the window and detach the old one. On timeout, cancellation, unsafe redirect or failure discard the candidate.

Use web live-status/reconciliation for an already loaded UI; main handles navigation/renderer failure and explicit retry. Never reload a healthy document on each transport retry or replay a submission. Keep an older server usable with navigation-level errors and manual retry if richer status is unavailable. Use accessible native menus plus a local settings surface; prefer normal window close/quit to hiding when tray restoration cannot be established. A second client-side web UI or a mandatory new health endpoint would break compatibility for no gain.

### 2. Grant specific operations, never a native toolbox

Keep sandbox, context isolation, web security and local-settings sender checks. Default-deny permissions. Scope every exception to the current window, top-level frame, exact origin and current connection generation; pending actions expire on navigation, sign-out where identity matters, or server switch. Do not authorize by hostname alone. No generic IPC, OS paths or capability tokens are returned to remote JavaScript.

- **Exports:** accept a user-initiated active-page download, including a same-origin page-created blob for export. Validate initiator and redirect chain, sanitize the suggested basename, run native Save As and pass the chosen path only to the download manager. Deny unknown provenance and cross-origin frames. Cancel, failed transfer and user-approved overwrite need explicit test cases. Never auto-open a file.
- **Audio:** grant only an explicit audio-only request from a secure/loopback main frame, after desktop and OS consent. Reject camera and mixed requests. Keep origin-scoped preferences locally; revoke in both permission checks and request handling. Stop active capture via the supported capture lifecycle or tear down the capturing document if necessary. Existing composer handles capture and transcription; do not record or route audio in main.
- **Notifications:** use a small versioned event contract: occurrence ID, event kind (`run-finished` or `input-pending`), and authorized chat ID. Expose only user-eligible events through the existing authenticated live path; add the minimal server/web capability if existing events cannot express both meanings. Reuse that connection; do not scrape the DOM, subscribe with a shared service credential or send duplicate Web Push and desktop notifications. A narrow, isolated adapter may pass an event hint/status from the active main frame, never arbitrary URLs, command names or notification text. Revalidate eligibility using the current server session before display/action; show shell-supplied text. Deduplicate by session scope and occurrence ID across reconnects, clear stale handles on identity/server changes, and open a validated same-origin chat route on click. If support or permission is missing, explain in settings and leave chat usable. Do not rely solely on service-worker push: it cannot cover plain LAN HTTP or guarantee the required event semantics.

### 3. Split build authority from release hosting

Keep build configuration in the **source repository**. If a distribution pilot is later approved, build on appropriate OS runners and use a separate **public distribution repository** (suggested name `mauzcode-desktop-releases`); choose the owner/name before producing packages and pin them into the app, not the server profile. Use a release-only repository with no source checkout, CI workflows or sensitive configuration copied in; GitHub's generated tag archives then contain only the release repository's contents. Pilot tags/channels are prereleases visible to everyone. The release inventory includes only packages, required update archives/metadata, verification data and public-safe notes. Anonymous HTTPS reads need no token. Future writes from source CI need narrowly scoped release credentials and separate human authorization. Do not publish anything as part of this change.

### 4. Verify before handing an update to the installer

Use electron-builder for NSIS x64, both macOS DMGs **and ZIP update archives**, and Linux x64 AppImage. Use electron-updater for download/staging/platform install. Pin the public GitHub repository and pilot channel in main; no account, server cookies, configurable feed URL or release credentials in the client. Filter by channel, version, architecture and OS, and do not downgrade. Provide explicit checking, downloading, ready, current and error states. Disable implicit install on ordinary quit for a deferred update; install at the user's explicit restart action.

A checksum fetched beside the binary is not proof of publisher identity. Sign a release manifest (version/channel/platform/architecture, exact asset identity, length and digest) outside the hosting repository; embed its verification public key in the app. Use a verified metadata/provider adapter so updater selections and final downloaded bytes must match that manifest, including on Linux. Never verify one file then allow the installer to fetch an unverified replacement. Enforce OS signature checks where applicable; macOS N and N+1 must have compatible signing identities accepted by the updater. If platform trust material or a working signed update path is missing, mark that target unverified rather than documenting a bypass.

A future macOS distribution decision has two separate checks. Use Developer ID signing and notarization for the distributed DMG and app. On clean Intel and Apple Silicon Macs, download the public DMG in a browser, install the app and open it with Gatekeeper and download quarantine intact. Record first launch before testing the updater; compatible N and N+1 signing identities do not establish that a fresh download will launch.

## Risks / Trade-offs

- **HTTP on LAN is unencrypted** → warn, retain sandboxing, keep mic disabled outside secure contexts; recommend HTTPS. A VPN does not make an HTTP origin secure to Chromium.
- **Legacy server lacks notification hints / reconnect events** → detect support and degrade only the affected features. Test a second user and an older server; live signals are not authorization.
- **Linux tray, AppImage prerequisites and notification daemons vary** → test on a named desktop distribution with and without a usable tray, document prerequisites and fail visibly. Do not imply distribution-wide support from one test.
- **Public prerelease exposes all assets and release text** → inspect a release inventory before publishing. A prerelease label separates channels, not audiences.
- **Native updater behavior depends on signatures, OS and filesystem** → run real packaged N to N+1 upgrades on every target, including Intel/Apple Silicon where advertised. Mocks cannot close that gate.

## Migration Plan

Only step 1 is part of this implementation. Steps 2–4 describe a future, separately approved release; none are required to close the change.

1. Implement and test locally with fixture servers, fake notifications and a synthetic signed update feed. Keep the existing app ID and origin partitions; avoid destructive profile migrations.
2. Produce platform artifacts. Only after separate approval create/configure the release-only repository and publish public-safe pilot builds. A legacy user manually installs the first pilot once; clean installs start at the connection screen.
3. Record clean-install, native feature and N to N+1 results per platform. Without a normal first launch from the public DMG, mark that Mac architecture unverified. Passing the pilot does not authorize stable distribution; the separate Windows distribution and stable release gates still apply.
4. If a release fails verification, leave the installed version running. If a valid release proves faulty, stop offering it and ship a higher, corrected signed version; retain the prior known-good installer for assisted recovery without deleting profiles. Do not automatically roll back across versions.
