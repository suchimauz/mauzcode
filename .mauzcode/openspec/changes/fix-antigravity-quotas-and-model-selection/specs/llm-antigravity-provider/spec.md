## REMOVED Requirements

### Requirement: Measured Antigravity quota by native model
**Reason**: An inventory fraction and reset do not identify either quota period or both independent limits.
**Migration**: Keep inventory for model discovery. Replace its usage observations with the connection's reported summary buckets; do not carry an old inventory figure into any period cell.

## ADDED Requirements

### Requirement: Read quota summary on the signed-in connection
Quota measurement SHALL use authenticated POST `v1internal:retrieveUserQuotaSummary` with the signed-in connection's resolved project on its fixed Cloud Code host and saved transport. This dedicated read MUST NOT allow arbitrary methods, hosts or redirects, generate a response from a model, or borrow another account's credentials or project. No raw credentials, project identifiers or response bodies SHALL be exposed in quota output or errors.

#### Scenario: Isolated read with an active sign-in
- **WHEN** usage is requested for an eligible signed-in connection
- **THEN** the quota read uses that connection's project, Hub client identity and transport, without generation or catalogue mutation
- **AND** an unlisted endpoint remains blocked; an access failure produces no probe of another project, account or host

### Requirement: Separate measured group and period buckets
The provider SHALL read `groups[].buckets[]` using structured bucket identity and `window` (`5h` or `weekly`), retaining each bucket's group, period, observation, valid fraction and reset independently. It MUST NOT infer a family or period from display labels, time until reset, equal readings or model inventory. The shared third-party pool SHALL supply Claude's windows, not account-wide limits.

#### Scenario: Independent measurements from one account
- **WHEN** `gemini-5h`, `gemini-weekly`, `3p-5h` and `3p-weekly` report remaining fractions 0.8, 0.4, 0.9 and 0.25 and four distinct resets with their matching windows
- **THEN** Gemini reports 20% and 60% used and Claude/GPT reports 10% and 75% used for five hours and weekly, respectively; each reset stays with its bucket
- **AND** an independently reported model-specific Gemini weekly bucket does not replace the general Gemini weekly bucket, even if its label contains Gemini

#### Scenario: Unit conversion and missing fields
- **WHEN** a bucket contains a fraction of 0 or 1, a valid reset without a fraction, or a valid fraction without a parseable reset
- **THEN** the reports distinguish 100% used, 0% used, unknown usage with a reset, and known usage with an unknown reset
- **AND** a missing bucket, invalid fraction or conflicting group/period evidence is not populated from another bucket, an inventory reading or a previous complete response
