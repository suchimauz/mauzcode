## Purpose

Distribute the remote desktop client independently of the MauzCode server and let pilot users safely install later versions without manually replacing the app.

## ADDED Requirements

### Requirement: Installable standalone client packages
The pilot SHALL provide Windows x64 NSIS, macOS Intel and Apple Silicon DMGs with corresponding update archives, and a Linux x64 AppImage. Users MUST NOT need to install a MauzCode server, database or developer toolchain. Upgrading from the legacy wrapper SHALL preserve its saved server and valid session.

#### Scenario: Clean install
- **WHEN** a tester opens the package for their supported platform on a clean machine
- **THEN** the desktop client starts and can connect to an existing server without installing or starting a local MauzCode service.

#### Scenario: First launch of the public macOS pilot
- **WHEN** a tester on a clean Intel or Apple Silicon Mac downloads the pilot DMG from the public release in a browser, installs the app and opens it normally with Gatekeeper enabled and download quarantine intact
- **THEN** the Developer ID-signed, notarized client reaches the connection screen without a security override. This must pass on each architecture before its installed N to N+1 update is tested.

#### Scenario: One-time migration
- **WHEN** a user with the legacy client manually installs the first updater-enabled package
- **THEN** their client data remains available and the next pilot version is obtainable from inside the app.

### Requirement: Independent public release channel
Installers, update artifacts, release notes and verification data SHALL be available without credentials from a separate public GitHub Releases repository pinned by the build. Source history, build automation, internal server addresses, secrets and internal configuration MUST NOT be published there. Pilot versions SHALL be clearly marked as public prereleases on a distinct pilot channel.

#### Scenario: Anonymous pilot download
- **WHEN** a person without a GitHub account visits the pilot release
- **THEN** they can identify its prerelease status and download the appropriate package without a token; a stable client does not select the pilot release.

#### Scenario: Switch collaboration servers
- **WHEN** the user changes the server address or the server suggests a different release feed
- **THEN** the application still checks only its build-pinned release repository and channel and sends no MauzCode session data to the release service.

### Requirement: Verified and deferrable in-app update
The installed client SHALL discover and download only a compatible newer version for its channel, OS and architecture. It SHALL authenticate release metadata, verify the downloaded package and enforce applicable platform signing checks before offering installation. It SHALL let the user defer restart without interrupting their session.

#### Scenario: Later, then update
- **WHEN** an installed pilot receives a valid update while a chat is open and the user selects Later
- **THEN** the current session is not interrupted; when the user subsequently chooses Restart and Update the client runs the newer version and preserves the server address and valid session.

#### Scenario: Feed unavailable or unsuitable
- **WHEN** GitHub is unavailable or no newer compatible release exists
- **THEN** settings report the appropriate state and the installed application remains usable without contacting an alternate feed.

#### Scenario: Reject a modified update
- **WHEN** update metadata has an invalid signature, a downloaded artifact differs from the authenticated digest, or a required platform signature is invalid
- **THEN** the app does not install or offer that update and leaves the working installation intact; no bypass of OS security controls is offered.

### Requirement: Platform-specific pilot evidence
A platform SHALL only be described as pilot-ready after a real installed N to N+1 update and end-to-end acceptance on that platform. Each macOS architecture SHALL also have evidence of a normal first launch from its public, notarized DMG; an updater signature check is not first-launch evidence. Public stable distribution SHALL be a separate release gate.

#### Scenario: Some targets are untested
- **WHEN** automated checks pass but a target has no clean-install, native feature and in-app upgrade evidence
- **THEN** that target is listed as unverified, not ready; a prerelease is not promoted to stable on the strength of another target's results.
