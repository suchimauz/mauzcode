---
fn: tools.todoUpdate
requires: [todo.create, todo.update]
description: >-
  Create or revise your visible todo list: ordered todos with stable unique ids. Without a list the
  first todo becomes active. With a list, kept ids keep their state, new ids start pending; active and
  done todos cannot be removed or reordered. Set status "active" on a pending or new todo only for
  really parallel work; active todos must precede pending ones and never return to pending. Returns
  {created, title, tasks:[{id,title,status}], active:[ids]}.
promptSnippet: "create or revise your visible todo list (ordered todos with stable ids)"
presentation:
  label: Todos
  icon: checklist
  category: agent
  summary: "@todos"
parameters:
  type: object
  properties:
    title:
      type: string
      description: "Short user-visible title of the todo list."
    tasks:
      type: array
      description: "Ordered, non-empty todo list; ids are stable and unique."
      items:
        type: object
        properties:
          id:
            type: string
            description: "Stable todo id, at most 120 characters."
          title:
            type: string
            description: "Short todo title, at most 300 characters."
          instructions:
            type: string
            description: "Optional detailed guidance."
          status:
            type: string
            enum: [active]
            description: "Optional: start this pending or new todo now, in parallel with other active todos."
        required: [id, title]
        additionalProperties: false
  required: [tasks]
  additionalProperties: false
---
