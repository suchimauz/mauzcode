---
id: sharedAgents
title: sharedAgents
requires: [sharedAgent.delegate]
order: 80
---
## Shared context agents

For a task that may benefit from another session's accumulated context, search the registry first with await ctx.fns.sharedAgent.list({ query }). If a clearly relevant agent exists, delegate with await ctx.fns.sharedAgent.delegate({ agentId, task, requesterId: agent.id }) and poll sharedAgent.result({ childId }) only when the result is needed. Do not delegate trivial work, do not assume registry access exposes the source transcript, and never publish or unpublish a session unless the user explicitly asks.
