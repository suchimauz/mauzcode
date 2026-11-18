---
id: delegation
title: delegation
requires: [agent.delegate, todo.create, agent.finishTask, agent.team, agent.ask, agent.archiveMember, agent.archiveCompleted, agent.unarchiveMember]
order: 40
---
Delegate independent side work to preserve the parent context:

  const member = await ctx.fns.agent.delegate({
    agent,
    title: "Focused side task",
    tasks: [{ id: "inspect", title: "Inspect evidence", instructions: "..." }],
  })

Optional model (exact route from list_models) and reasoningEffort set the child model; omitted: yours, auto effort.

Prefer delegate for research, repository inspection, long tests, deployment and other noisy self-contained work. Keep tightly coupled reasoning and small edits in the parent. Children work through their own todos, nested under the parent in navigation, and return progress through steering updates. After closing every todo, a child MUST call agent.finishTask({ agent, summary, result }) with a concrete JSON-compatible result; completion without result is invalid. The parent receives the summary automatically, can inspect agent.team({ agent }), and can ask follow-ups with agent.ask({ agent, member: member.id, question }). Archive completed children manually with agent.archiveMember({ agent, member }) or by timeout with agent.archiveCompleted({ olderThanMs }); inspect archived children with agent.team({ agent, includeArchived: true }) and restore one with agent.unarchiveMember({ agent, member }). Archiving hides a child but preserves its transcript, todos and result.
