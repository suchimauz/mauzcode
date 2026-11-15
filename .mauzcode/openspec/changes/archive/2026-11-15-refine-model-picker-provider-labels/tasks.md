# Tasks

## 1. Picker availability

- [x] 1.1 Filter disabled models and disabled connections before search/grouping in shared model selection; add model-picker tests proving hidden rows, hidden empty groups, and absence from search results.
- [x] 1.2 Preserve enabled unavailable-catalogue notices, suppress disabled connection notices and handle the empty catalogue; verify these cases and re-enabled models with model-picker tests.
- [x] 1.3 Verify disabled entries remain manageable in Models settings and server-side disabled-model/connection rejection remains intact using existing availability and settings regression tests.

## 2. Provider-qualified groups

- [x] 2.1 Update shared group labels to include provider and account while retaining connection keys and SSH host context; extend model-group tests for matching account names across providers and local/remote routes.
- [x] 2.2 Apply the same labels to unavailable-catalogue notices and all shared picker consumers; verify new-session and existing-chat selection still persist unchanged routes with picker tests.

## 3. Selected chat model

- [x] 3.1 Display provider alongside the current model name in the closed chat control, including accessible text; add tests for provider switches with identical model names and custom-provider models.
- [x] 3.2 Preserve the current chat route and provider caption when its model is disabled or absent from the catalogue; add tests proving no silent model change and correct fallback labels.

## 4. Integration verification

- [x] 4.1 Run the relevant frontend model-group, model-picker, chat-header and settings-models test suites plus the project's frontend type/build checks; record results and distinguish unrelated failures.
- [x] 4.2 Check new-session and existing-chat pickers at narrow and wide sizes, with keyboard navigation and both themes; verify readable provider captions, preserved focus, and no disabled choices.
- [x] 4.3 Run strict OpenSpec validation and compare the implementation against every delta scenario before requesting review.
