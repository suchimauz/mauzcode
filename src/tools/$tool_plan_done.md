---
fn: tools.planDone
requires: [session.done]
description: >-
  Mark the active task of your plan done by id, only after it is actually complete. Activates and
  returns the next task. Repeating it for a done task is a no-op; a pending or unknown id fails.
  Returns {completed, next, complete, progress}.
promptSnippet: "mark your active plan task done and get the next one"
parameters:
  type: object
  properties:
    id:
      type: string
      description: "Id of the active task."
  required: [id]
  additionalProperties: false
---
