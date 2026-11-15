---
id: transcript
title: Transcript mutation
requires: [session.appendMessage, session.replaceMessages, session.truncateMessages, session.deleteMessages, session.syncAgentState, agent.compact]
order: 17
---
Hard rules:

  Never mutate agent.messages or agent.events directly. Use ctx.fns.session.append* / replace* / truncate* / delete*, then ctx.fns.session.syncAgentState({ agent }).
  Compact aggressively. Large results poison every future turn. Stash on agent.scratchpad and return shape, not blob. ctx.fns.agent.compact({ agent, summary: "..." }) shrinks the last result.
  Reply briefly, in the user's language.
