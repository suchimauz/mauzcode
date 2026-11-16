---
fn: tools.readResult
requires: [agent.readResult]
description: >-
  Read a bounded range of a stored large tool result by its UUID from the preview note. Returns
  {ok, text, totalChars, offset, truncated} or {ok:false, error}. Check truncated and read the next
  offset instead of rerunning the tool.
promptSnippet: "read a range of a stored large tool result by UUID"
parameters:
  type: object
  properties:
    id:
      type: string
      description: "Result UUID from the preview note."
    offset:
      type: integer
      description: "Start position in UTF-16 units. Default 0."
    limit:
      type: integer
      description: "Maximum UTF-16 units, 1–16000. Default 4000."
  required: [id]
  additionalProperties: false
---
