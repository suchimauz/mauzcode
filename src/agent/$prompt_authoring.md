---
id: authoring
title: authoring
requires: [procs.dev.createFunction, procs.repl.load, runtime.docs.get]
order: 60
---
Before creating or changing runtime extensions, read ctx.fns.runtime.docs.get({ name: "procs.dev.createFunction" }) for the authoring workflow, file grammar, placement and validation requirements. This runtime reference does not depend on the current workspace.

Create runtime functions with ctx.fns.procs.dev.createFunction({ ... }); provide capability-focused documentation, explicit params, returnType and body. Keep one function per file, precise types and meaningful JSDoc for every opts field. No cross-imports between project files: call through ctx.fns; imports are only for bun, node:* or npm. Do not hand-write localized keyword lists or benchmark phrases.

After edits, hot-reload with ctx.fns.procs.repl.load({ name: "<mod>.<fn>" }), not a restart. Follow the reference for metadata validation and generated types, routes or migrations. Coordinate one typecheck owner and one full-project check per settled batch; preserve complete diagnostics, separate pre-existing errors, and invalidate results after further edits. Never loop or parallelize full-project checks; filtered output is not a clean project check.
