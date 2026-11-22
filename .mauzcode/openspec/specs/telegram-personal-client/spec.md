# Personal Telegram client

## Purpose
Describe how the personal Telegram client reads dialogs and messages, searches one chat, and distinguishes direct send confirmation from native HTTP safeguards.

<!-- Last verified: d35de7c2, 2026-11-22; static inspection only. -->
<!-- uncertainty: The cited route tests use mocks; they do not establish live delivery, session authorization or the identity of whoever set confirm. -->
<!-- deferred: plugins/telegram/src/telegram/$route_api_avatar_$userId_GET.ts (avatar content); external news and agent messaging are outside this baseline. -->

## Requirements

### Requirement: Dialog previews
The direct dialog list SHALL request 50 dialogs by default and return at most 120 characters of preview per dialog.

#### Scenario: Long last message
- **WHEN** a caller lists dialogs without a maximum and the last message contains 150 ASCII letters
- **THEN** the client requests 50 dialogs and returns the first 120 letters as that dialog's lastMessage

<!-- id: telegram-dialogs-getdialogs -->
<!-- entities: dialog, lastMessage -->
<!-- enforced: plugins/telegram/src/telegram/dialogs.ts#default -->

### Requirement: Direct history order
The history function SHALL reject a null or missing chat and return messages in reverse order of the fetched batch.

#### Scenario: Default history window
- **WHEN** the caller supplies a chat but no maximum and the client fetches two messages newest first
- **THEN** it requests up to 50 messages and returns the older one first

<!-- id: telegram-messages-getmessages -->
<!-- entities: chat, message -->
<!-- enforced: plugins/telegram/src/telegram/messages.ts#default -->

### Requirement: Search within one chat
Search SHALL require a non-null chat and a nonempty query, search the resolved peer in pages of at most 100 and default to at most 100 results.

#### Scenario: Search across pages
- **WHEN** the caller requests 120 matches and the first page contains 100
- **THEN** the next request uses the last match ID as its offset and asks for at most 20 more; matches without message text appear as `[media]`

<!-- id: telegram-searchchat-search -->
<!-- entities: chat, query, result -->
<!-- enforced: plugins/telegram/src/telegram/searchChat.ts#default -->

### Requirement: Direct text send confirmation
The direct send function SHALL require a non-null chat, truthy text and literal boolean confirmation before connecting to send.

#### Scenario: Missing confirmation
- **WHEN** a caller supplies chat and text but omits confirm
- **THEN** the function rejects the request before connecting

<!-- id: telegram-send-confirm -->
<!-- entities: chat, text, confirm -->
<!-- enforced: plugins/telegram/src/telegram/send.ts#default -->
<!-- test: plugins/telegram/src/telegram/writeGuard.test.ts::send requires explicit confirmation before connecting -->

### Requirement: Native page entry
The former HTML entry SHALL redirect to the native Telegram overview without returning a page body.

#### Scenario: Open former entry
- **WHEN** the page handler receives a request
- **THEN** it returns 302 with Location `/?view=extension:telegram/overview` and an empty body

<!-- id: telegram-route-get-redirect -->
<!-- entities: page, overview -->
<!-- enforced: plugins/telegram/src/telegram/$route__GET.ts#default -->
<!-- test: plugins/telegram/src/telegram/nativePage.test.ts::Telegram native page redirect has no HTML client -->

### Requirement: Native route access checks
Dialog, history and send routes SHALL reject an absent user with 401 when authentication is required and not legacy, and reject a present non-owner with 403.

#### Scenario: Member requests personal data
- **WHEN** a signed-in member requests dialogs or history
- **THEN** the route returns 403 before reading personal data

<!-- id: telegram-route-dialogs-currentuser -->
<!-- entities: user, route -->
<!-- enforced: plugins/telegram/src/telegram/$route_api_dialogs_GET.ts#default; plugins/telegram/src/telegram/$route_api_messages_GET.ts#default; plugins/telegram/src/telegram/$route_api_send_POST.ts#default -->
<!-- test: plugins/telegram/src/telegram/nativePage.test.ts::all personal JSON/avatar reads require authenticated owner before accessing data -->

### Requirement: Native mirrored reads
The native dialog route SHALL return mirrored dialogs with a CSRF token and disable caching; native history SHALL select recent default-session user-peer messages for the requested chat and return them in ascending date and ID order.

#### Scenario: Load personal dialogs
- **WHEN** the dialog route passes access checks and the mirror returns no dialogs
- **THEN** the response contains an empty dialogs array and the request's CSRF token with Cache-Control set to no-store

#### Scenario: Missing history selector
- **WHEN** an authorized history request has no nonblank chat parameter
- **THEN** the route returns 400 instead of selecting messages

<!-- id: telegram-route-dialogs-mirror -->
<!-- entities: dialog, token, message -->
<!-- enforced: plugins/telegram/src/telegram/$route_api_dialogs_GET.ts#default; plugins/telegram/src/telegram/$route_api_messages_GET.ts#default -->

### Requirement: Native send safeguards
After access checks the send route SHALL verify CSRF, require valid JSON with nonblank chat and text after string conversion and trimming, and require literal boolean confirmation before dispatch.

#### Scenario: Rejected send
- **WHEN** CSRF verification fails, the payload is malformed or lacks chat or text, or an otherwise valid payload lacks true confirmation
- **THEN** the route returns 403, 400 or 409 respectively without dispatching a send

#### Scenario: Accepted send
- **WHEN** an owner's request passes CSRF verification and supplies chat `123`, text `hello` and confirm true
- **THEN** the route forwards those three values to the direct send function and returns its result under message on success

<!-- id: telegram-route-send-verifycsrf -->
<!-- entities: chat, text, token, confirm -->
<!-- enforced: plugins/telegram/src/telegram/$route_api_send_POST.ts#default -->
<!-- triggers: telegram-send-confirm -->
<!-- test: plugins/telegram/src/telegram/nativePage.test.ts::send rejects missing owner, CSRF and explicit confirmation without sending; valid mock sends exact snapshot -->
