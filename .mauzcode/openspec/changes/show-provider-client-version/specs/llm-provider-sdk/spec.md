## ADDED Requirements

### Requirement: Optional client version report
A provider definition MAY declare a client version operation that receives the resolved connection and returns the effective client version, a source code from a provider-documented set and an optional short detail. The version MUST match the value the provider's next request would send for that connection. Providers without the operation SHALL be treated as having no client version to report.

#### Scenario: Provider reports its version
- **WHEN** the client version of a connection whose provider declares the operation is requested
- **THEN** the result contains the effective version string, its source code and optionally a detail

#### Scenario: Provider without the operation
- **WHEN** the client version of a connection whose provider does not declare the operation is requested
- **THEN** no version is reported and no provider code or network request runs

### Requirement: Client version report secrecy
A client version report MUST NOT contain secret values, secret references, tokens or raw command output.

#### Scenario: Report from a logged-in connection
- **GIVEN** a connection with stored credentials
- **WHEN** its client version is reported
- **THEN** the report holds only the version, the source code and the optional detail, without credentials or command output
