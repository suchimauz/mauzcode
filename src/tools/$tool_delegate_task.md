---
fn: tools.delegateTask
requires: [agent.delegate]
description: >-
  Delegate independent side work to a new child agent that runs an ordered todo list asynchronously.
  Returns {id, status:"working"} at once and never waits; the child's summary and result arrive later
  as a team update, so end your turn instead of polling. presetId can only narrow your own access.
promptSnippet: "delegate an ordered todo list to a child agent; returns its id at once"
presentation:
  label: Delegate
  icon: delegate
  category: agent
  summary: "{title}[ · {tasks|count} tasks]"
parameters:
  type: object
  properties:
    title:
      type: string
      description: "Short title for the child and its todo list."
    tasks:
      type: array
      description: "Ordered, non-empty todo list in the todo format; ids are stable and unique."
      items:
        type: object
        properties:
          id:
            type: string
            description: "Stable task id."
          title:
            type: string
            description: "Short task title."
          instructions:
            type: string
            description: "Self-contained guidance; the child does not see your transcript."
        required: [id, title]
        additionalProperties: false
    presetId:
      type: string
      description: "Optional preset that narrows the child's access; never widens yours."
    model:
      type: string
      description: "Exact child route from list_models; omitted inherits yours."
    reasoningEffort:
      type: string
      enum: [auto, off, minimal, low, medium, high, xhigh, max]
      description: "Child effort supported by its model; omitted means auto."
  required: [title, tasks]
  additionalProperties: false
---
