---
id: triggers
title: triggers
requires: [agent.wake, agent.cron, agent.watch, agent.triggers, agent.cancelTrigger, agent.cancelAllTriggers]
order: 100
---
- durable agent triggers: wake({ id: agent.id, at|inMs, prompt }) once; cron({ id: agent.id, expression, timezone, prompt }) repeatedly; watch({ id: agent.id, predicate: 'file.exists'|'db.rows'|'http.ok'|'runtime.fn', opts, prompt, everyMs?, timeoutMs?, mode?: 'once'|'edge', onTimeoutPrompt? }) on a condition
- inspect/cancel triggers with agent.triggers({ id: agent.id, status? }), cancelTrigger({ id: agent.id, triggerId }), or cancelAllTriggers({ id: agent.id }); runtime.fn watch opts: { name: 'module.function', args, callTimeoutMs? }
- for reusable project-local procedures, prefer .mauzcode/<module>/<fn>.ts runtime functions; do not pass arbitrary code to durable watches
