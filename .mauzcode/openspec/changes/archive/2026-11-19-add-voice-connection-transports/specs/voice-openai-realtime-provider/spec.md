## ADDED Requirements

### Requirement: Routed OpenAI Realtime upstream

OpenAI Realtime SHALL advertise `direct`, `socks` and `ssh-tunnel` and open every upstream socket through the resolved voice connection's WebSocket operation, for both connection tests and live transcription. Transport selection SHALL NOT change the browser `/voice/session` protocol or replace the disclosed audio destination with the proxy or SSH host.

#### Scenario: Test and dictate to the same endpoint
- **WHEN** a connection uses either the default endpoint or a custom Base URL and the user tests it and then dictates
- **THEN** both WSS handshakes use the selected route to that endpoint; the test waits for transcription configuration confirmation and closes without sending audio, while the live session streams on its routed socket.

#### Scenario: Selected route breaks
- **WHEN** a saved SOCKS5 proxy or SSH tunnel is unavailable for the connection test or live handshake
- **THEN** the operation fails through the existing sanitized Voice error contract, without opening a direct socket or forwarding audio elsewhere.
