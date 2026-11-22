# Interactive workspace terminal

## Purpose

Describe how a Canvas terminal tab connects to a local chat workspace, exchanges terminal data and ends its interactive session.

<!-- Last verified: 2026-11-22 at d35de7c2; source inspection only. -->

## Requirements

### Requirement: Open a terminal for the current chat
The Terminal launcher SHALL require a chat agent and connect the terminal view to the current host using the agent ID and initial terminal dimensions.

#### Scenario: No chat selected
- **WHEN** the launcher has no agent ID
- **THEN** it shows a chat-only alert instead of opening a terminal.

#### Scenario: Start from a chat
- **WHEN** the view initializes for a chat
- **THEN** it shows a connecting status and opens `/terminal/socket` with the encoded agent ID, columns and rows, using `mauzcode-terminal` and a secure WebSocket on HTTPS.

<!-- id: terminal-launcher-agent-context -->
<!-- entities: Canvas launcher, chat agent, terminal view -->
<!-- enforced: plugins/terminal/ui/index.tsx#TerminalLauncher; plugins/terminal/ui/TerminalView.tsx#TerminalView, socketUrl -->
<!-- test: frontend/src/test/terminal-extension.test.tsx :: asks for a chat when there is no agent -->
<!-- test: frontend/src/test/terminal-extension.test.tsx :: connects to the owner terminal socket with size, relays input, output, resize and theme -->

### Requirement: Authorize the handshake
The terminal socket SHALL accept only an owner making a same-origin GET on the terminal endpoint with the terminal subprotocol, a valid agent ID and valid dimensions for an existing local workspace directory.

#### Scenario: Identity or origin refused
- **WHEN** the request lacks a user, or a signed-in non-owner requests the socket
- **THEN** authorization returns 401 or 403 respectively; an owner's missing or mismatched Origin also receives 403.

#### Scenario: Invalid handshake parameters
- **WHEN** an otherwise authorized request has the wrong method, path or subprotocol, an agent ID outside `[A-Za-z0-9_-]{1,128}`, or noninteger or out-of-range dimensions
- **THEN** authorization returns 400; valid columns range from 2 to 500 and rows from 2 to 200, inclusive.

#### Scenario: Resolve the workspace
- **WHEN** a valid owner handshake identifies an unknown agent, a remote workspace or an unusable workspace path
- **THEN** authorization returns 404 for the unknown agent and 409 for a remote host or a path that is not an absolute, stat-able directory.

<!-- id: terminal-authorize-handshake -->
<!-- kind: invariant -->
<!-- entities: owner, handshake, agent workspace -->
<!-- enforced: plugins/terminal/src/terminal/authorize.ts#default; plugins/terminal/src/terminal/$ws_socket.ts#upgrade -->
<!-- test: plugins/terminal/src/terminal/terminal.test.ts :: terminal handshake requires owner, same origin, subprotocol, valid agent and local workspace -->

### Requirement: Reserve and start a shell
The service SHALL reserve at most four simultaneous terminal sessions and start each accepted socket's interactive shell in the selected workspace at the authorized size.

#### Scenario: Capacity reached
- **WHEN** four sessions are reserved and another authorized handshake arrives
- **THEN** it receives 429 instead of a reservation.

#### Scenario: Start result
- **WHEN** the shell starts successfully
- **THEN** the socket sends a ready message containing the working directory; omitted handshake dimensions default independently to 80 columns and 24 rows. A spawn failure instead releases the reservation and closes with 1011.

<!-- id: terminal-socket-upgrade-reservation -->
<!-- entities: socket, session reservation, interactive shell -->
<!-- enforced: plugins/terminal/src/terminal/$ws_socket.ts#upgrade, open; plugins/terminal/src/terminal/authorize.ts#default -->
<!-- test: plugins/terminal/src/terminal/terminal.test.ts :: at most four terminals run at once -->
<!-- test: plugins/terminal/src/terminal/terminal.test.ts :: live PTY runs in the workspace, resizes, and its shell dies when the socket closes -->

### Requirement: Exchange terminal data
An open session SHALL relay text input and valid resize events to its pseudo-terminal and deliver terminal output to the view as bytes.

#### Scenario: Synchronize the view
- **WHEN** the view receives ready and later changes size
- **THEN** it clears the connecting status and sends its dimensions on ready and again on resize; accepted integer dimensions resize the pseudo-terminal within the handshake size bounds.

#### Scenario: Interactive input and output
- **WHEN** the terminal emits input or the shell produces output within the backlog limit
- **THEN** the view relays the input string in a JSON input frame for writing to the pseudo-terminal, and renders output from binary frames.

<!-- id: terminal-socket-message-relay -->
<!-- entities: view, socket, pseudo-terminal -->
<!-- enforced: plugins/terminal/src/terminal/$ws_socket.ts#message, open; plugins/terminal/ui/TerminalView.tsx#TerminalView -->
<!-- test: frontend/src/test/terminal-extension.test.tsx :: connects to the owner terminal socket with size, relays input, output, resize and theme -->
<!-- test: plugins/terminal/src/terminal/terminal.test.ts :: live PTY runs in the workspace, resizes, and its shell dies when the socket closes -->

### Requirement: Close sessions at protocol and resource limits
The service SHALL end a running session on invalid client frames, excess output backlog or expiry of the client-message idle timer.

#### Scenario: Invalid client frame
- **WHEN** a client sends binary data or text larger than 64 KiB
- **THEN** the socket closes with 1009; for smaller or equal text frames, malformed JSON, unsupported messages and invalid resize values close it with 1003.

#### Scenario: Backlog or inactivity
- **WHEN** pending output plus the next chunk exceeds 1 MiB, or twelve hours pass after startup or the last accepted client message without another client message
- **THEN** the backlog condition closes the socket with 1013 and the idle timeout closes it with 1000; shell output alone does not reset the timer.

<!-- id: terminal-socket-message-limits -->
<!-- entities: client frame, output backlog, idle timer -->
<!-- enforced: plugins/terminal/src/terminal/$ws_socket.ts#message, open -->
<!-- test: plugins/terminal/src/terminal/terminal.test.ts :: shell exit closes the socket with an exit frame; invalid frames close the session -->

### Requirement: End and restart a terminal session
Socket closure SHALL release the reservation and initiate shell termination. The view SHALL report closure and offer a fresh session rather than resuming the old shell.

#### Scenario: Shell exits first
- **WHEN** the shell exits while the socket is live
- **THEN** the server sends its exit code before closing with 1000; the view reports that code on close. Without an exit frame it displays a close explanation instead.

#### Scenario: Hide, remove or restart the view
- **WHEN** the mounted view is merely hidden
- **THEN** its socket stays connected; unmounting closes the socket and disposes the terminal. Selecting restart on a closed view creates a new connection.

<!-- id: terminal-socket-close-session -->
<!-- entities: socket, shell, terminal view -->
<!-- enforced: plugins/terminal/src/terminal/$ws_socket.ts#close, kill, open; plugins/terminal/ui/TerminalView.tsx#TerminalView, closeMessage -->
<!-- test: plugins/terminal/src/terminal/terminal.test.ts :: live PTY runs in the workspace, resizes, and its shell dies when the socket closes -->
<!-- test: plugins/terminal/src/terminal/terminal.test.ts :: shell exit closes the socket with an exit frame; invalid frames close the session -->
<!-- test: frontend/src/test/terminal-extension.test.tsx :: reports the shell exit and restarts a fresh session on request -->
<!-- test: frontend/src/test/terminal-extension.test.tsx :: explains a refused connection -->

<!-- uncertainty: No direct assertion found for idle expiry, backlog overflow, spawn failure or hiding a mounted tab. The frontend tests use a simulated socket and terminal. -->
