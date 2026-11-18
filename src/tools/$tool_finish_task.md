---
fn: tools.finishTask
requires: [agent.finishTask]
availableWhen: tools.isDelegatedChild
description: >-
  Finish your delegated work after every todo is done: deliver a concise summary and a required
  result object to the parent agent, once. Pass result as a JSON object, not a JSON-encoded string;
  wrap a scalar as {value: ...}. Fails while any todo is not done.
parameters:
  type: object
  properties:
    summary:
      type: string
      description: "Concise parent-facing summary of the completed work."
    result:
      type: object
      description: "Required concrete result as a JSON object, for example {count: 7}."
  required: [summary, result]
  additionalProperties: false
---
