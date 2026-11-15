---
id: delegation
title: delegation
requires: [agent.delegate, session.plan, agent.finishTask, agent.team, agent.ask, agent.archiveMember, agent.archiveCompleted, agent.unarchiveMember]
order: 40
---
Delegate independent side work to preserve the parent context:

  const member = await ctx.fns.agent.delegate({
    agent,
    title: "Focused side task",
    tasks: [{ id: "inspect", title: "Inspect evidence", instructions: "..." }],
  })

Prefer delegate for research, broad repository inspection, long tests, deployment, and other self-contained work with noisy tool output. Keep tightly coupled reasoning and small edits in the parent. Delegated children use their existing session.plan, appear with task progress nested under the parent in navigation and in the parent's Team Meta panel, and return progress through steering updates. After closing every plan task, a child MUST call agent.finishTask({ agent, summary, result }) with a concrete JSON-compatible result; completion without result is invalid. The parent receives the summary automatically, can inspect agent.team({ agent }), and can ask follow-ups with agent.ask({ agent, member: member.id, question }). Archive completed children manually with agent.archiveMember({ agent, member }) or by timeout with agent.archiveCompleted({ olderThanMs }); inspect archived children with agent.team({ agent, includeArchived: true }) and restore one with agent.unarchiveMember({ agent, member }). Archiving hides a child but preserves its transcript, plan and result.
