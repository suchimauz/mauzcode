## ADDED Requirements

### Requirement: Provider inference descriptors
A provider definition MAY declare inference descriptors: an optional system preamble that callers place first in the system instructions, and the vendor whose public price catalogue applies to its models. Callers MUST obtain these values through route resolution and MUST NOT branch on provider ids.

#### Scenario: Claude preamble
- **WHEN** a route on a `claude` connection is resolved
- **THEN** the result carries the Claude Code identity line as system preamble and `anthropic` as price vendor

#### Scenario: Provider without descriptors
- **WHEN** a provider declares no inference descriptors
- **THEN** resolution reports no preamble and no price vendor

### Requirement: Provider-neutral tool definitions
The models stream and one-shot call SHALL accept tools in one provider-neutral format: name, description and JSON Schema parameters. Each provider MUST convert them to its own wire format, choosing it from connection configuration when the protocol is configurable. Callers MUST NOT pass provider-shaped tool schemas.

#### Scenario: Same tools, different providers
- **GIVEN** the same neutral `read` tool
- **WHEN** it is streamed through a `claude` connection and through a `codex` connection
- **THEN** the claude request carries it with `input_schema` and the codex request carries it as a Responses `function` tool

#### Scenario: Custom protocol
- **WHEN** a neutral tool is streamed through a `custom` connection configured with the `openai-chat` protocol
- **THEN** the request carries it as a Chat Completions `function` tool

#### Scenario: Optional fields disable strict mode
- **WHEN** a neutral tool schema has an optional property at any nesting level
- **THEN** OpenAI-shaped wire tools are sent with `strict: false`
