## ADDED Requirements

### Requirement: Request-based model usage statistics
New Session SHALL rank models and select the favorite by the number of completed requests with a recorded model within the selected period and owner scope. It SHALL group routes by their shared display name, count a request even when its token usage is unavailable, and MUST NOT infer a historical model from the session’s current selection. Requests without a recorded model SHALL be omitted from model rankings and charts without removing activity or measured tokens from overall totals.

#### Scenario: The session model changes or is cleared
- **WHEN** a session records two requests for model A and one for model B in the selected period, and its current model is later changed or cleared
- **THEN** the list counts two requests for A and one for B, and A is the favorite regardless of the current selection

#### Scenario: Request count is independent of token coverage
- **WHEN** two requests for model A have no token measurements and one request for model B has measured usage
- **THEN** A is the favorite, and its unavailable token usage is not reported as zero

#### Scenario: Known and unknown models in the same period
- **WHEN** one request for A has 10 measured tokens and three requests without a recorded model have 30 measured tokens in total
- **THEN** the overview includes all 40 tokens, the model list and chart attribute only 10 to A, and A is the favorite

#### Scenario: No attributed requests in the selected period
- **WHEN** the selected period contains messages and measured usage but no requests with a recorded model
- **THEN** the overview retains those totals, Favorite model displays `—`, and the model list and chart contain no entry for `null` or any other placeholder
