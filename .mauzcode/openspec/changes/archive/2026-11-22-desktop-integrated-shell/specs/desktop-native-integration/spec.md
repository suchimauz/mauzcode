## ADDED Requirements

### Requirement: Integrated window frame
The main and settings windows SHALL replace the operating system's title bar with a draggable title strip in MauzCode colours with theme-matched native window controls on Windows, Linux and macOS. On Windows and Linux the menu bar SHALL NOT be visible, while shell shortcuts keep working and shell commands stay reachable from a menu button in the title strip; macOS keeps the system menu bar.

#### Scenario: Alt does not reveal a menu bar
- **WHEN** the user presses and releases Alt on Windows or Linux
- **THEN** no menu bar appears.

#### Scenario: Windows or Linux window
- **WHEN** the user opens the desktop client on Windows or Linux
- **THEN** no File/Edit/View style menu bar is shown, the title strip and window controls use the current MauzCode theme, the window can be moved by dragging the strip and maximised by double-clicking it.

#### Scenario: Shortcuts without a menu bar
- **WHEN** the user presses the settings, retry, reload, back, zoom or quit shortcut with the menu bar hidden
- **THEN** the same action runs as before.

#### Scenario: Shell menu from the title strip
- **WHEN** the user activates the menu button in the title strip by mouse or keyboard
- **THEN** a native menu with settings, retry connection, reload, zoom and quit opens next to the button.

#### Scenario: Theme change
- **WHEN** the user switches the MauzCode theme between light and dark
- **THEN** the title strip and native window controls change to the matching colours without reloading the chat.

#### Scenario: Server without title-strip support
- **WHEN** the connected server does not render the desktop title strip
- **THEN** the window still shows a draggable strip and usable window controls.

### Requirement: Native context menu
The desktop client SHALL show a native context menu on right-click that offers, as applicable, cut, copy, paste and select all for editable fields and selections; copy link address and open link in the system browser for HTTP(S) links; and copy image for images. Opening a link SHALL use the same confirmation as other external links. No menu SHALL appear when no item applies.

#### Scenario: Copy selected chat text
- **WHEN** the user selects text in the chat and right-clicks it
- **THEN** a menu with Copy appears and choosing it puts the selection on the clipboard.

#### Scenario: Edit in the composer
- **WHEN** the user right-clicks inside the message composer
- **THEN** cut, copy, paste and select all are offered according to what is currently possible.

#### Scenario: Link
- **WHEN** the user right-clicks an HTTP(S) link
- **THEN** copy link address and open in browser are offered, and opening asks for confirmation first.

#### Scenario: Non-web link
- **WHEN** the user right-clicks a link whose scheme is not HTTP or HTTPS
- **THEN** no link items are offered.

## MODIFIED Requirements

### Requirement: Preserve the remote-content boundary
Remote pages SHALL remain sandboxed without Node access, filesystem APIs or general-purpose desktop IPC. Capability decisions SHALL be scoped to the active top-level server origin rather than inherited by child frames or other servers. The window bridge (platform and title-strip geometry, theme reporting, opening the shell menu) SHALL accept only strictly validated arguments from the top-level frame of the active server origin, and SHALL NOT expose a way to run arbitrary shell commands, navigate, or change local settings.

#### Scenario: A foreign frame requests native access
- **WHEN** a nested or foreign frame asks for a desktop permission or tries to invoke a local settings action
- **THEN** it receives no grant or privileged result, even when the top-level server has a microphone grant.

#### Scenario: A foreign frame uses the window bridge
- **WHEN** a nested frame or a page from another origin tries to report a theme or open the shell menu
- **THEN** the request is ignored and the window and stored preferences are unchanged.
