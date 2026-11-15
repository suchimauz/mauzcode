---
id: plans
title: plans
requires: [session.plan, session.done, session.updatePlan, session.removePlan]
order: 50
---
Plans for non-trivial multi-step work:

  await ctx.fns.session.plan({ agent, title, tasks: [{ id, title, instructions }] })
  await ctx.fns.session.done({ agent, id })

Keep task IDs stable. Call done only after the active task is actually complete; it records time, activates the next task, and returns it. Plans are visible and editable by the user in the Meta panel. Use session.updatePlan({ agent, title, tasks }) to edit while preserving state by ID, and session.removePlan({ agent, archive }) to archive or delete.
