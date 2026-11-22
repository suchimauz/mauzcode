# Proposal

## Why

People who already have access to a MauzCode server should be able to install one desktop client, sign in and get back to their chat without installing or managing MauzCode locally. The existing Electron wrapper opens the web UI, but it blocks downloads and microphone access, offers little help when a connection fails, and has no Linux distribution or in-app update path.

## What Changes

- Keep a single saved server. Confirm that a candidate serves MauzCode, not just a reachable page, before replacing the working address. Support same-origin web login; if sign-in requires an external identity provider, explain the pilot limitation and keep the current server. Distinguish login, connection loss and unsafe TLS; recover without resubmitting work.
- Bring together connection, permissions, version and updates in accessible desktop settings. Keep the window reachable with or without a working system tray.
- Support Save As for downloads/exports, opt-in microphone use for existing dictation, and background OS notifications for finished runs and pending human input. Keep remote pages sandboxed.
- Configure client-only builds for Windows x64, Intel and Apple Silicon Macs, and Linux x64. Implement in-app updates from a build-pinned release channel independent of the selected server. Verify the packaging configuration and update path locally with a fixture feed and disposable signing keys.

This change delivers the implementation, not an installed pilot. Producing and signing native installers, Apple notarization, public hosting or publication, and clean-machine install and update tests are outside its acceptance criteria. All targets remain unverified for distribution; `desktop/PILOT.md` records the evidence needed before claiming otherwise.

## Capabilities

### New Capabilities

- `desktop-server-connection`: first run, persistent server selection, desktop settings, window lifecycle and connection recovery.
- `desktop-native-integration`: origin-scoped desktop downloads, microphone consent and user-scoped agent notifications.
- `desktop-release-updates`: client-only packaging targets, a build-pinned release feed and verification of platform-specific updates before installation.

### Modified Capabilities

None. Existing `chat-voice-dictation` governs the web composer; this change addresses the desktop permission boundary, not the dictation workflow.

## Impact

The implementation affects `desktop/`, packaging and release tooling in the source repository, and a narrow authenticated event integration with the web client. It reuses the server UI, existing session and live transport; it does not embed agents, Bun, Postgres or a second frontend. Closing this change does not authorize repository creation, publication or stable distribution.
