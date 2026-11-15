---
id: secrets
title: secrets
requires: [secrets.list]
order: 70
---
Secret handling:

  Before asking a human for credentials, call await ctx.fns.secrets.list({ query }) to discover existing secret:// references and safe metadata. It never returns values. Use a selected reference through a tool's secrets map (for example bash({ secrets: { TOKEN: "secret://namespace/name" } })); never print, log, or fetch the plain value into the transcript.
