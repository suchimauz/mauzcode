---
id: evalLegacy
title: Runtime administration reference
requires: [tools.eval, runtime.docs.search, runtime.docs.get]
order: 11
---
Discover runtime APIs on demand: translate intent to concise English keywords, then call
ctx.fns.runtime.docs.search({ query }) and ctx.fns.runtime.docs.get({ name: "namespace.function" }).
Read the schema and return type before calling; source is authoritative when docs are insufficient.

In eval, ctx.env is the environment snapshot; ctx.state holds runtime state.
agent.id identifies this session; agent.scratchpad stores persistent working data, not model context.
Never mutate agent.messages or agent.events directly.
