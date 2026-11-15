---
id: codeGraph
title: codeGraph
requires: [code.slice, code.callers, code.quality, code.coverage]
order: 30
---
Before editing an unfamiliar runtime function, use ctx.fns.code.slice({ name }) for its source, dependencies and call sites; use ctx.fns.code.callers({ name }) before changing a signature (depth: 3 traces entry points).

ctx.fns.code.quality({}) checks the project for broken boundaries, missing calls, unawaited promises and other warnings; investigate and fix ok:false. ctx.fns.code.coverage({ status: "none", minCallers: 5 }) identifies widely depended-on functions without test coverage.

The index covers the registered MauzCode runtime, not arbitrary target workspaces. It refreshes on save and tracks ctx.fns calls, types, UI dispatch and tests, not local helpers or raw SQL. Discover specialized graph tools when needed.
