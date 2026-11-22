## MODIFIED Requirements

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
The shell SHALL provide keyboard-accessible settings for the server, native permissions, installed version and update controls. It SHALL support light and dark appearances and keep the main window recoverable whether or not a tray is available. The settings window SHALL use the same colours, typography, radii, grouped rows and integrated title strip as the MauzCode application, and SHALL follow the theme the user selected on the connected server, falling back to the system appearance when no theme is known.

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
