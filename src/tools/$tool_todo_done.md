---
fn: tools.todoDone
requires: [todo.done]
description: >-
  Mark an active todo done by id, only after it is actually complete. When no todo remains active,
  activates and returns the next pending one. Repeating it for a done todo is a no-op; a pending or
  unknown id fails. Returns {completed, active, next, complete, progress}.
promptSnippet: "mark an active todo done and get the next one"
parameters:
  type: object
  properties:
    id:
      type: string
      description: "Id of an active todo."
  required: [id]
  additionalProperties: false
---
