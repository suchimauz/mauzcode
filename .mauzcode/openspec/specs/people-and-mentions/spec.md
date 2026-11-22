# People administration, attribution and mentions

## Purpose
Describe who can manage the people directory, how shared chats identify human authors to the model, and how each recipient's mentions become unread or read.

Last verified: 2026-11-22 at `d35de7c2`. Source files are identified below. Unrelated untracked baseline specs were present.

## Requirements

### Requirement: Owner directory access
The People endpoint SHALL refuse non-owners and provide owners either directory data without password hashes or a redirect to the People page.

#### Scenario: Request directory data
- **WHEN** an owner requests `/auth/users` with Accept containing `application/json`
- **THEN** the no-store response includes disabled as well as active accounts, password-presence flags, linked providers, the owner's ID, a CSRF token and Google configuration limited to domain and auto-create policy or null.

#### Scenario: Browser visit
- **WHEN** a visitor requests the endpoint without a JSON Accept header
- **THEN** an owner receives a 303 to `/?view=people`; anyone else receives 403 instead.

<!-- id: auth.route-users-get.accept -->
<!-- entities: owner, account, directory -->
<!-- enforced: src/auth/$route_users_GET.ts default export -->
<!-- test: src/auth/peopleApi.test.ts:7 -->

### Requirement: Directory write guards
People writes SHALL require an owner and valid CSRF token and SHALL reject attempts by owners to disable themselves or change their own role.

#### Scenario: Reject a write before changing access
- **WHEN** a non-owner posts, an owner submits an invalid body or token, or an owner requests their own disable or role action as JSON with valid credentials
- **THEN** the respective statuses are 403, 400 for an invalid body, 403 for an invalid token, and 400 for either self-access action; the action is not applied.

<!-- id: auth.route-users-post.verify-csrf -->
<!-- kind: invariant -->
<!-- entities: owner, directory action -->
<!-- enforced: src/auth/$route_users_POST.ts default export -->
<!-- test: src/auth/peopleApi.test.ts:8 -->

### Requirement: People actions
Authorized owners SHALL be able to add people, enable or disable others, assign roles and edit their own profile through the People endpoint.

#### Scenario: Add without a password
- **WHEN** an owner adds a person without a password
- **THEN** the endpoint rejects the action if Google sign-in is off and otherwise requests passwordless account creation.

#### Scenario: Update an account
- **WHEN** an owner submits a valid role change for another account or saves their own profile
- **THEN** only the role value `owner` selects owner rather than member; profile saves target the caller, clear blank email and leave a blank password unchanged.

#### Scenario: Report an action result
- **WHEN** a recognized action succeeds or an unknown action is submitted after write guards pass
- **THEN** JSON clients receive 200 with `ok` or 400 with `error`, respectively; form clients not requesting JSON receive a 303 back to the People page with the corresponding message.

<!-- id: auth.route-users-post.action -->
<!-- entities: owner, account, profile -->
<!-- enforced: src/auth/$route_users_POST.ts default export, switch on action -->

### Requirement: Request-time human attribution
Outgoing attribution SHALL leave stored messages unchanged and label eligible human messages only when at least two accounts are active.

#### Scenario: Attribute shared chat content
- **WHEN** the model request includes a non-excluded user message with a recorded human author on a shared installation with two active accounts
- **THEN** the outgoing string or first text part starts with `<Name>: ` using the current name or the author ID if unknown; an array without text gains an initial text part containing `<Name>:`.

#### Scenario: Preserve unlabelled content
- **WHEN** fewer than two accounts are active, or a message is excluded, lacks an author, has an agent author or is not a user message
- **THEN** attribution leaves that message unchanged.

<!-- id: auth.attribute-messages.active-users -->
<!-- entities: account, outgoing message -->
<!-- enforced: src/auth/attributeMessages.ts default export; src/agent/buildLlmRequest.ts call to auth.attributeMessages -->
<!-- test: src/auth/authorship.test.ts:11; src/auth/authorship.test.ts:25 -->

### Requirement: Resolve mentioned people
Mention parsing SHALL return recognized person IDs once each in first appearance order, ignoring case in the input and excluding embedded address matches.

#### Scenario: Mixed tokens
- **WHEN** the cached people list contains `anna` and the text is `@ANNA, @anna, mail x@anna.io or /@anna, cc @unknown`
- **THEN** the result is just `anna`; neither unknown IDs nor tokens preceded by a word character, `@`, dot, slash or hyphen add a recipient.

<!-- id: mentions.parse.match-all -->
<!-- entities: person ID, message text -->
<!-- enforced: src/mentions/parse.ts default export; src/mentions/people.ts default export -->

### Requirement: Create unread mentions once per recipient
Mention recording SHALL create at most one unread entry per chat, message index and recipient, excluding the author and suppressing all mentions from a hidden agent sender.

#### Scenario: Save or retry a mention
- **WHEN** a person sends a chat message mentioning themselves and another person twice
- **THEN** only the other person gets an unread entry with the author and a whitespace-normalized excerpt of up to 240 UTF-16 code units; retrying the same recording creates no entry or change event. New recipients are reported in `mentions.changed`.

#### Scenario: Hidden sender
- **WHEN** the recorded sender identifies a hidden agent
- **THEN** recording returns no recipients and creates no mention.

<!-- id: mentions.record.recipient-conflict -->
<!-- kind: invariant -->
<!-- entities: message, sender, recipient, unread mention -->
<!-- enforced: src/mentions/record.ts default export; src/session/appendMessage.ts call to mentions.record -->
<!-- test: src/mentions/mentions.test.ts:17; src/mentions/mentions.test.ts:63 -->

### Requirement: Recipient-specific mention history
The mention list SHALL select only the specified recipient's entries, defaulting to the viewer, and optionally exclude read entries.

#### Scenario: Read the viewer's unread list
- **WHEN** the viewer requests unread entries without specifying a recipient or limit
- **THEN** at most 30 unread entries for that viewer are returned, newest creation time first with descending ID breaking ties; without a resolved recipient the result is empty.

<!-- id: mentions.list.to-user -->
<!-- entities: viewer, recipient, mention -->
<!-- enforced: src/mentions/list.ts default export -->
<!-- test: src/mentions/mentions.test.ts:17 -->

### Requirement: Read only matching unread entries
Marking mentions read SHALL affect only unread entries for the resolved recipient that satisfy every supplied chat and mention ID filter.

#### Scenario: Open a chat with unread mentions
- **WHEN** a viewer marks a chat seen without a through-timestamp and the mention update succeeds
- **THEN** their unread entries in that chat become read; other recipients and other chats are unchanged.

#### Scenario: No matching entry
- **WHEN** the read operation resolves no recipient or finds no matching unread row
- **THEN** it returns a count of zero and emits no change event; otherwise it returns the number changed and emits `mentions.changed` for that recipient.

<!-- id: mentions.mark-read.unread-recipient -->
<!-- entities: recipient, chat, mention -->
<!-- enforced: src/mentions/markRead.ts default export; src/auth/markSeen.ts call to mentions.markRead -->
<!-- test: src/mentions/mentions.test.ts:17 -->

<!-- uncertainty: Tests were inspected, not executed. Message saving and marking seen catch mention-processing errors; neither guarantees delivery after a storage failure. -->
<!-- deferred: src/auth/createUser.ts, src/auth/updateUser.ts, src/auth/setUserDisabled.ts; underlying account validation is outside this route baseline. -->
