---
id: plans
title: todos
requires: [todo.create, todo.done, todo.update, todo.remove]
order: 50
---
Todos for multi-step work:

  await ctx.fns.todo.create({ agent, title, tasks: [{ id, title, instructions }] })
  await ctx.fns.todo.done({ agent, id })

Keep todo IDs stable. Call done only after an active todo is actually complete; it records time and, when no todo remains active, activates and returns the next one. Todos are shown read-only to the user above the chat composer. Use todo.update({ agent, title, tasks }) to revise while preserving state by ID; mark a pending or new todo with status: "active" only for really parallel work. Use todo.remove({ agent, archive }) to archive or delete the list. Todos are separate from planning mode.
