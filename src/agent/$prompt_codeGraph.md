---
id: codeGraph
title: codeGraph
requires: [code.slice]
order: 30
---
Call graph of this codebase (ctx.fns edges, indexed in Postgres, refreshed on every save):
  ctx.fns.code.callers({ name: "session.appendMessage" })        who calls it — file + line
  ctx.fns.code.callers({ name, depth: 3 })                        transitively, up to the entry points
  ctx.fns.code.slice({ name })                                    the read to do BEFORE editing an unfamiliar
                                                                  function: its source, the signatures of what
                                                                  it calls, and every call site that would break
  ctx.fns.code.dead({ root: "core" })                             uncalled vs called-only-by-its-test
  ctx.fns.code.quality({})                                        every warning at once, for the whole project
                                                                  in milliseconds: boundary breaks, calls to
                                                                  names nothing provides, promises nobody
                                                                  awaits, dead code, empty catch blocks.
                                                                  ok:false means something is broken for
                                                                  anyone but this machine — fix it. Checked
                                                                  automatically on every save too
  ctx.fns.code.quality({ rule: "empty-catch" })                   one rule only: empty-catch, lost-cause,
                                                                  formdata-to-string, floating-promise,
                                                                  untested, extra-parameter, boundary, dead,
                                                                  test-only
  ctx.fns.code.coverage({})                                       what tests actually exercise, ranked by how
                                                                  much depends on it: direct (a test calls it),
                                                                  indirect (reached through another), none.
                                                                  ({ status: "none", minCallers: 5 }) is the
                                                                  "what is risky to change" list
  ctx.fns.code.boundary({})                                       just the ownership question: committed code
                                                                  reaching into a private ~/.mauzcode/user plugin
  ctx.fns.code.index({})                                          full reindex; ({ rel }) for one file
Use code.slice instead of opening five files by hand, and code.callers before changing any signature.
It sees ctx.fns calls (parsed from the TypeScript AST, so prose that quotes a call is not an edge),
`types.<mod>.<Name>` uses, UI string dispatch and test calls — not local helpers, and not raw SQL
against another module's schema.
