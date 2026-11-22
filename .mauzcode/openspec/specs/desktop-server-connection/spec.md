# desktop-server-connection Specification

## Purpose
Give a desktop user a reliable way to connect to one existing MauzCode server, sign in, and recover access without running a local server or losing their work.

## Requirements

### Requirement: Connect to one existing server
The desktop client SHALL guide users from an address to the server's normal web UI or sign-in page, without requiring a local MauzCode installation. It SHALL only replace the last working address after the candidate loads the UI and its same-origin MauzCode session response confirms either a signed-in session or that sign-in is not required.

#### Scenario: First launch
- **WHEN** the user opens the client without a saved address
- **THEN** it shows address examples for HTTPS, LAN/VPN and localhost, offers a connection check, and opens the chosen server's UI or sign-in page on success.

#### Scenario: Reject a broken replacement
- **WHEN** a user with a saved working server tests an invalid, unreachable or certificate-invalid replacement
- **THEN** the client explains the failure, keeps the old address and profile, and offers a way back; on restart it uses the old address.

#### Scenario: Reachable address is not MauzCode
- **WHEN** a candidate returns an HTTP 200 placeholder or captive portal instead of the expected MauzCode session response
- **THEN** the client explains that it could not confirm a MauzCode server there; the previous chat stays open and its saved address is still used after restart.

#### Scenario: Legacy profile
- **WHEN** a user installs the pilot over the existing desktop client and their server session is still valid
- **THEN** it opens the saved address with the same session, does not require setup again, and does not store a separate password or token.

### Requirement: Explain transport and authentication failures
The client SHALL distinguish sign-in from connection loss and certificate failure. It SHALL warn before using unencrypted LAN/VPN HTTP and MUST NOT bypass certificate verification.

#### Scenario: Authentication required
- **WHEN** a candidate requires sign-in and offers a login flow that stays on its origin
- **THEN** the client lets the user complete that flow without reporting an outage or saving the candidate prematurely; once sign-in succeeds and the UI loads, it can switch. An ordinary access denial is not treated as network loss.

#### Scenario: Only external OIDC sign-in is available
- **WHEN** the candidate requires a new session and the only sign-in option redirects to an identity provider on another origin
- **THEN** the client explains that this sign-in method is unsupported in the pilot and offers a return to setup or the previous chat. It does not report a network outage or replace the saved server or session.

#### Scenario: LAN server versus invalid TLS
- **WHEN** the user selects a LAN HTTP address
- **THEN** the client warns that the connection is not encrypted and lets them proceed or cancel; a certificate-invalid HTTPS address instead fails with no bypass action.

### Requirement: Recover from a transient outage
The client SHALL expose connection status and retry without clearing the profile, automatically replaying commands, or reloading an otherwise usable chat on each temporary loss of live connectivity. It SHALL announce loss and recovery only after a real transport failure; replacing the live stream on purpose (switching agents or chats, changing the watched topics, a user-requested retry) SHALL NOT be announced as a lost or restored connection, however long the replacement takes.

#### Scenario: Network drops during a conversation
- **WHEN** an open chat loses connectivity and the server becomes reachable again
- **THEN** the user sees loss and recovery, can retry, and returns to the conversation using normal server resynchronization, without a duplicated message or action.

#### Scenario: Switching agents over a slow network
- **WHEN** the user switches between agents and the live stream takes longer than the announcement grace period to reopen, without any transport error
- **THEN** no "connection lost" or "connection restored" message appears and the settings window does not report reconnecting.

#### Scenario: Failure while switching agents
- **WHEN** the reopened stream fails with a transport error after an agent switch and the failure lasts beyond the grace period
- **THEN** the loss is announced, and recovery is announced once the stream is back.

### Requirement: Reachable settings and window
The shell SHALL provide keyboard-accessible settings for the server, native permissions, installed version and update controls, styled like the MauzCode application. Settings SHALL follow the theme selected on the connected server, else the system appearance. The main window SHALL stay recoverable whether or not a tray is available.

#### Scenario: Keyboard-only settings
- **WHEN** a keyboard user opens settings in either appearance
- **THEN** they can identify the current server and version, change the server, review permissions and check for updates with visible focus, and return to their work.

#### Scenario: Settings follow the server theme
- **WHEN** the user selected the dark theme on the server while the operating system uses a light appearance, and then opens desktop settings
- **THEN** the settings window and its title strip are dark.

#### Scenario: No known theme
- **WHEN** no server theme has been reported yet
- **THEN** the settings window follows the system appearance.

#### Scenario: Background lifecycle
- **WHEN** the user closes the window with a working tray and then selects Show
- **THEN** their existing window is restored; explicit Quit exits the app.

#### Scenario: No usable tray
- **WHEN** the tray cannot be created or the desktop environment cannot expose it
- **THEN** the application remains usable and closing its last window does not leave a hidden process with no restoration path.
