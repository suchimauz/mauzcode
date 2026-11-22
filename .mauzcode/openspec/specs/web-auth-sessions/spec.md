# Web sign-in and cookie sessions

## Purpose
Describe how a browser obtains a MauzCode identity, how protected requests use it, and how a mobile client joins or a browser ends a login.

Last verified: 2026-11-22, source commit `d35de7c21ff42cdbfb2db0272d6874d4db17a4e0`. Source files are listed at their enforcement points below.

## Requirements

### Requirement: Password login
Password login SHALL accept a matching active account's password, require an email to distinguish multiple active accounts, and refuse password login in OIDC-only mode.

#### Scenario: One active account
- **WHEN** the sole active account submits its correct password without an email outside OIDC-only mode
- **THEN** JSON login returns success, account details and a session cookie; form login sets the cookie and redirects with 303 to `next`, defaulting to `/` if it lacks a leading slash or begins with `//`.

#### Scenario: Refused credentials
- **WHEN** credentials do not match on an account-based installation
- **THEN** JSON login returns 401 with `invalid_credentials`; form login redirects to the login page with an error and the return path.

#### Scenario: Password login disabled
- **WHEN** a password is submitted in OIDC-only mode
- **THEN** JSON login returns 403 with `password_sign_in_disabled`; form login redirects to `/auth/login`.

<!-- id: auth-verify-user-password -->
<!-- entities: account, password, session cookie -->
<!-- enforced: src/auth/verifyUser.ts (auth.verifyUser); src/auth/$route_login_POST.ts (default export); src/auth/issueSession.ts (auth.issueSession) -->

### Requirement: Request identity and admission
Protected requests SHALL use the identity resolved for that request, requiring sign-in unless the installation qualifies for open access.

#### Scenario: Open access outside OIDC-only mode
- **WHEN** no portal identity is present and there are no listed users or shared password, or the only listed user cannot sign in
- **THEN** authentication is not required; the first case has no user and the second uses the sole listed user.

#### Scenario: Legacy shared password
- **WHEN** no users are listed outside OIDC-only mode and a configured shared password matches at login
- **THEN** login issues a legacy owner cookie that admits protected requests without attaching an account.

#### Scenario: Federated identity or cookie
- **WHEN** a trusted portal identity is resolved
- **THEN** the request uses that person without requiring a browser cookie, including in OIDC-only mode.

#### Scenario: Account session required without a portal identity
- **WHEN** a protected request requires an account session
- **THEN** a cookie naming an OIDC session is resolved against that session; otherwise a signed account cookie is resolved by user ID outside OIDC-only mode and is not accepted in OIDC-only mode.

#### Scenario: Missing authentication
- **WHEN** authentication is required and neither an account nor a legacy login is resolved
- **THEN** a GET accepting HTML receives a 303 login redirect carrying the requested path and query; other requests receive JSON with status 401.

<!-- id: auth-current-user-admission -->
<!-- entities: request, portal identity, account, session -->
<!-- enforced: src/auth/currentUser.ts (auth.currentUser); src/$middleware.ts (default export); src/auth/$route_login_POST.ts (default export) -->
<!-- test: src/auth/portal.test.ts — valid RS256 assertion signs in and auto-creates a member -->

### Requirement: Federated callback completion
A successful federated callback SHALL establish a session for the linked user, clear the callback state cookie and return a 303 redirect.

#### Scenario: Returning from the provider
- **WHEN** a Google or OIDC callback verifies the identity and links it to an allowed account
- **THEN** Google issues a regular account cookie and OIDC starts a server-side session; the redirect uses the saved destination or `/` if it does not begin with a single slash.

#### Scenario: OIDC state mismatch
- **WHEN** a configured OIDC callback receives a code but its signed state does not match the returned state
- **THEN** it clears the state cookie and redirects to the login page with an error rather than starting a session.

<!-- id: auth-oidc-callback-session -->
<!-- entities: provider, linked account, session, callback state -->
<!-- enforced: src/auth/$route_oidc_callback_GET.ts (default export); src/auth/$route_google_callback_GET.ts (default export) -->

### Requirement: Mobile session handoff
Mobile completion SHALL redirect a signed-in user with a single-use code rather than the browser cookie. Exchange SHALL preserve an associated OIDC session rather than creating an independent login.

#### Scenario: Browser completes handoff
- **WHEN** mobile completion receives a session user
- **THEN** it redirects with 303 to `mauzcodemobile://auth/callback` with the code; without a user the handler returns 401.

#### Scenario: Redeeming the code
- **WHEN** a valid code is exchanged for an active user
- **THEN** the app receives the user and a cookie for the same live OIDC session, or an ordinary 30-day account cookie for an unbound code outside OIDC-only mode.

#### Scenario: Unusable code
- **WHEN** the exchange receives an expired, already consumed or revoked-session code, or an unbound code in OIDC-only mode
- **THEN** it returns 401 without a cookie; a missing code instead returns 400.

<!-- id: auth-exchange-mobile-session -->
<!-- entities: handoff code, account, mobile session -->
<!-- enforced: src/auth/exchangeMobileSession.ts (auth.exchangeMobileSession); src/auth/$route_mobile_complete_GET.ts (default export); src/auth/$route_mobile_exchange_POST.ts (default export) -->
<!-- test: src/auth/mobileHandoff.test.ts — revoked control-plane session before exchange: the code is refused -->

### Requirement: Browser logout
Logout SHALL clear the browser cookie even if push cleanup fails, and attempt to revoke the named OIDC session when present.

#### Scenario: Ending a login
- **WHEN** the browser logs out with a verified session cookie
- **THEN** logout attempts push cleanup before OIDC revocation and clears the cookie; a client accepting JSON receives success and other clients receive a 303 redirect to `/auth/login`.

#### Scenario: Invalid cookie
- **WHEN** the cookie cannot be verified
- **THEN** logout skips push cleanup and still clears the cookie.

<!-- id: auth-logout-post-clear -->
<!-- entities: browser cookie, push subscription, OIDC session -->
<!-- enforced: src/auth/$route_logout_POST.ts (default export) -->
<!-- test: src/auth/logoutPush.test.ts — logout revokes push before its stable OIDC binding and clears cookie; push cleanup failure cannot block logout; invalid cookie does not attempt push cleanup -->

<!-- deferred: src/auth/oidcSession.ts; src/auth/createMobileSession.ts; src/auth/users.test.ts; src/auth/$middleware.test.ts; src/auth/google.test.ts -->
<!-- uncertainty: Provider availability, cookie serialization and OIDC renewal were not exercised. Tests were inspected, not executed. -->
