# Tasks

## 1. Record and expire safe diagnostics

- [x] 1.1 Add allowlisted cause and stage mapping at the voice adapter/session boundary; test recognized and unknown responses carrying credential and transcript canaries, verifying neither canary survives.
- [x] 1.2 Add diagnostic storage, exact-ID and bounded recent reads, and scheduled expiry; use an isolated database and controlled clock to verify uniqueness, the seven-day boundary and physical cleanup after downtime.
- [x] 1.3 Persist once on terminal provider failure and extend the sanitized error with an optional reference; verify repeated terminal signals yield one record and a failed insert leaves the original error intact.

## 2. Expose diagnostics to the owner

- [x] 2.1 Add owner-only list and lookup endpoints; test authorized access and direct non-owner requests for a known ID.
- [x] 2.2 Display the reference in inline dictation and voice mode; test both with and without an ID.
- [x] 2.3 Add the Errors view under Settings → Voice and document lookup, retention and exclusions in the voice guide; verify lookup of a recorded fake-provider failure using the documented flow, including a missing-ID result.
