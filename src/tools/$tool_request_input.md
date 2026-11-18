---
fn: tools.requestInput
requires: [input.request]
description: >-
  Open a structured form in the chat (confirm, choice, grid, batch, secret or another listed kind)
  instead of asking in prose. Returns {id, kind, state, waiting} at once, never the answer. With
  waitForAnswer true the turn ends after this call and later calls in the same response are skipped;
  the answer arrives as a new <input-result> turn. Never ask for secrets in chat; a secret form returns
  only its secret:// reference. A generic confirm never replaces an action's own protected approval.
promptSnippet: "open a structured chat form (confirm, choice, grid, batch, secret)"
promptGuidelines:
  - "Call request_input last in a response; with waitForAnswer true the turn ends after it and later calls do not run."
presentation:
  label: Ask user
  icon: form
  category: agent
  summary: "{title}[ · {kind}]"
parameters:
  type: object
  properties:
    kind:
      type: string
      description: "Input kind listed under Chat inputs, for example confirm, choice, grid, batch or secret."
    title:
      type: string
      description: "Short question shown as the card heading."
    message:
      type: string
      description: "Optional Markdown explanation under the heading."
    spec:
      type: object
      description: "Kind-specific settings as listed under Chat inputs."
    waitForAnswer:
      type: boolean
      description: "End the turn and wait for the answer. Default false."
    expiresAt:
      type: integer
      description: "Optional future epoch-millisecond deadline."
  required: [kind, title]
  additionalProperties: false
---
