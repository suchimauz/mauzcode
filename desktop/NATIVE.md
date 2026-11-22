# Desktop Save As and dictation

**Save a file.** Start a download from the active page and choose a destination in the native Save As dialog. Authenticated attachments and page-generated same-origin blob exports use Chromium’s normal streaming download in the server profile. There is no renderer byte bridge or application size limit. Background, child-frame and foreign-origin downloads are rejected. Cancel leaves the destination unchanged; existing files require overwrite approval. Nothing opens the result automatically.

**Dictate.** Use the existing chat microphone, or grant microphone access from desktop settings. Confirm the exact server origin, and allow OS microphone access if asked. On macOS this uses the microphone privacy prompt; on Windows enable microphone access for desktop apps in system settings. Linux enforces the device/portal policy when acquiring the stream; desktop consent cannot bypass it. Use HTTPS or an HTTP loopback address (`localhost`, `127.0.0.0/8`, `::1`). Denying access does not disable typed chat. Revoking a potentially capturing page reloads its document (unsent drafts may be affected); switching servers destroys the old window. No camera, mixed capture or permission for embedded frames. The wrapper neither records nor transcribes; the web composer and the server’s voice provider remain responsible for dictation.

## Main-process contract

Attach once per server session. Electron 44 supplies the initiating frame, gesture, initiator origin and redirect chain in `will-download`. Keep the Save As decision synchronous: `setSavePath` is only available inside that event. Stage in a private directory beside the chosen destination; publish only on successful completion for the same active document and generation. Navigation, switch and quit invalidate pending transfers. A hard kill may leave the private staging directory behind. New files require a filesystem supporting hard links for atomic no-overwrite publication.

macOS requires `NSMicrophoneUsageDescription` and the signed audio-input entitlement. Real OS prompts, hardware, authenticated Chromium downloads and blob activation still require packaged pilot checks.
