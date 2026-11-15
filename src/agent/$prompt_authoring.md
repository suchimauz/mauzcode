---
id: authoring
title: authoring
requires: [procs.dev.createFunction, procs.repl.load]
order: 60
---
Architecture conventions. The codebase is procedural with one thing per file:

  src/<mod>/<fn>.ts                       → ctx.fns.<mod>.<fn>      export default async function (ctx, session, opts: {...})
  src/<mod>/<Name>.ts (capitalized)       → types.<mod>.<Name>      export type — auto-global via genTypes
  src/<mod>/$setting_<key>.ts             → declared setting        export default { type, default, env, ... }
  src/<mod>/$route_<path>_<METHOD>.ts     → HTTP handler            _ = /, $param = :param
  src/<mod>/$migration_<ts>_<name>.ts     → Postgres migration      export default { up(ctx), down?(ctx) }
  src/<mod>/$script_<name>.js             → browser asset           served as /<mod>/<name>.js
  src/<mod>/$fence_<lang>.ts              → ```<lang> Markdown block  export default render + export const hint

.mauzcode/<mod>/<fn>.ts is an ADDITIONAL runtime function root with the same grammar,
scanned AFTER src/ (overrides by name): .mauzcode/skill/uptime.ts → ctx.fns.skill.uptime.
After creating one: await ctx.fns.procs.dev.genTypes({}) + await ctx.fns.procs.repl.load({ name: "skill" }).

Runtime function authoring rules:

  Create a new runtime function with ctx.fns.procs.dev.createFunction({ ... }); it requires capability-focused summary/description, explicit params (use [] for none), returnType and body, and performs typecheck, reload and metadata validation.
  After changing existing runtime functions, hot-reload them and validate each with ctx.fns.runtime.docs.validate({ name: "<mod>.<fn>", strict: true, typecheck: false }). Then run ctx.fns.procs.dev.typecheck({}) ONCE for the settled batch of edits and reuse its diagnostics for all changed files. typecheck({ filter }) still compiles the WHOLE project; the filter only selects output. Never loop validate({ typecheck: true }) or typecheck({ filter }) over files, and never parallelize those full-project checks.
  Coordinate one typecheck owner across parent and child agents working in the same project. Share the result and the source state it covers; rerun only after further edits, and do not treat a result as current if source changed during or after the check. Preserve the complete diagnostics (in agent scratch storage if large), distinguishing pre-existing errors from new ones; filtered output alone is not a clean project check.
  Write actionable JSDoc that states the exact supported capability and when to use it. Document every opts field with meaningful descriptions and applicable @default/@minimum/@maximum tags. Prefer precise types over any/unknown.
  Do not hand-write localized keyword lists or benchmark phrases. Index-time localization derives multilingual retrieval text from honest TypeScript and JSDoc metadata.

No cross-imports between project files — call via ctx.fns. import statements are only for bun, node:*, npm.

After editing files, hot-reload (don't restart):

  await ctx.fns.procs.repl.load({ name: "<mod>" })        reload a whole namespace
  await ctx.fns.procs.repl.load({ name: "<mod>.<fn>" })   reload a single function
  await ctx.fns.procs.dev.genTypes({})                    after add/remove file — regenerates ctx_ns.d.ts
  await ctx.fns.procs.http.loadRoutes({})                 after touching $route_*.ts
  await ctx.fns.procs.migrate.up({})                      after dropping a $migration_*.ts
