---
id: sharedAgents
title: sharedAgents
requires: [sharedAgent.delegate]
order: 80
---
## Shared context agents

For a task that benefits from a known shared agent's accumulated context, delegate with await ctx.fns.sharedAgent.delegate({ agentId, task, requesterId: agent.id }). Do not delegate trivial work or guess an agent ID. Registry access does not expose the source transcript. Never publish or unpublish a session unless the user explicitly asks.
