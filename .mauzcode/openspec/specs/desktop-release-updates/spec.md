# desktop-release-updates Specification

## Purpose
Define the client-only packaging targets and how the desktop client verifies updates independently of its selected MauzCode server. A configured target is not an installed or published release.

## Requirements

### Requirement: Client-only packaging targets
The build configuration SHALL target Windows x64 NSIS, macOS Intel and Apple Silicon DMGs with matching ZIP update archives, and a Linux x64 AppImage. Package inputs SHALL be limited to the desktop client, its runtime dependencies and approved public update settings; they MUST NOT include a MauzCode server, database, credentials or internal server settings. The client SHALL retain the legacy application identity and profile location.

#### Scenario: Check the proposed package inventory
- **WHEN** the proposed pilot inventory is checked against the configured targets
- **THEN** it must include the NSIS installer, a DMG and a ZIP for each Mac architecture, the AppImage, signed update metadata and reviewed notes; missing or unexpected entries are rejected.

#### Scenario: Reuse a legacy profile
- **WHEN** the client starts with an existing legacy profile containing a saved server and a valid session
- **THEN** it reuses the address and that origin's persistent session without copying credentials to another origin.

### Requirement: Independent public release channel
The client SHALL read the build-pinned GitHub Releases repository and channel without credentials, independent of the collaboration server. A separately approved public pilot SHALL offer only installers, update files, verification data and reviewed notes for anonymous download from a release-only repository. Source, workflows, secrets and internal settings MUST NOT be published. Pilot releases SHALL be marked as prereleases on a distinct channel.

#### Scenario: No release configured
- **WHEN** the client is unpackaged or lacks its release verification key
- **THEN** it reports updates as unavailable without contacting a feed.

#### Scenario: Identify a pilot release
- **WHEN** the pinned feed lists a pilot prerelease
- **THEN** a client on the pilot channel can discover a compatible newer version without a token; a stable client does not select it.

#### Scenario: Switch collaboration servers
- **WHEN** the user changes the server address or the server suggests a different release feed
- **THEN** the application still checks only its build-pinned release repository and channel and sends no MauzCode session data to the release service.

### Requirement: Verified and deferrable in-app update
The installed client SHALL discover and download only a compatible newer version for its channel, OS and architecture. It SHALL authenticate release metadata, verify the downloaded package and enforce applicable platform signing checks before offering installation. It SHALL let the user defer restart without interrupting their session.

#### Scenario: Later, then update
- **WHEN** a verified update is staged while a chat is open and the user selects Later
- **THEN** the current session is not interrupted and ordinary quit does not install the update. Only an explicit Restart and Update action hands the reverified package to the platform installer.

#### Scenario: Feed unavailable or unsuitable
- **WHEN** GitHub is unavailable or no newer compatible release exists
- **THEN** settings report the appropriate state and the installed application remains usable without contacting an alternate feed.

#### Scenario: Reject a modified update
- **WHEN** update metadata has an invalid signature, a downloaded artifact differs from the authenticated digest, or a required platform signature is invalid
- **THEN** the app does not install or offer that update and leaves the working installation intact; no bypass of OS security controls is offered.

### Requirement: Platform-specific pilot evidence
A platform SHALL only be described as pilot-ready after a clean install, native feature checks and a real installed N to N+1 update on that platform. Each Mac architecture SHALL also have independent first-launch evidence. Stable distribution requires a separate release decision.

#### Scenario: Review a Mac target for a future pilot
- **WHEN** an Intel or Apple Silicon Mac is proposed for pilot use
- **THEN** before its update test, a tester must download the public DMG in a browser, install the app on a clean Mac and open it without an override with Gatekeeper and download quarantine intact. Both the DMG and app must be Developer ID-signed and notarized; an updater signature check alone is not first-launch evidence.

#### Scenario: Some targets are untested
- **WHEN** automated checks pass but a target has no clean-install, native feature and in-app upgrade evidence
- **THEN** that target is listed as unverified, not ready; a prerelease is not promoted to stable on the strength of another target's results.
