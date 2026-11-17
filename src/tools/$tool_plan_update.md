---
fn: tools.planUpdate
requires: [session.plan, session.updatePlan]
description: >-
  Create or revise your visible work plan: ordered tasks with stable unique ids. Without a plan the
  first task becomes active. With a plan, kept ids keep their state, new ids start pending; active and
  done tasks cannot be removed or reordered. Returns {created, title, tasks:[{id,title,status}], active}.
promptSnippet: "create or revise your visible plan (ordered tasks with stable ids)"
parameters:
  type: object
  properties:
    title:
      type: string
      description: "Short user-visible plan title."
    tasks:
      type: array
      description: "Ordered, non-empty task list; ids are stable and unique."
      items:
        type: object
        properties:
          id:
            type: string
            description: "Stable task id, at most 120 characters."
          title:
            type: string
            description: "Short task title, at most 300 characters."
          instructions:
            type: string
            description: "Optional detailed guidance."
        required: [id, title]
        additionalProperties: false
  required: [tasks]
  additionalProperties: false
---
