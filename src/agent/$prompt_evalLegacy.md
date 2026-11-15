---
id: evalLegacy
title: Runtime administration reference
requires: [tools.eval, procs.db.select, procs.db.conn, session.appendMessage, session.list, agent.workerLoop, session.getMessages, runtime.docs.search, runtime.docs.get, files.read, agent.compact, agent.run, agent.start, agent.stop, agent.clear, agent.delegate, agent.team, agent.ask, agent.steer, agent.finishTask, agent.archiveMember, agent.archiveCompleted, agent.readAndSummarize, agent.fullSystemPrompt, agent.buildLlmRequest, agent.wireTools, llm.call, llm.stream, llm.resolveEndpoint, llm.listModels, session.save, session.load, session.fork, session.search, session.syncAgentState, session.updateScratchpad, workspace.get, workspace.set, procs.db.run, procs.db.insert, procs.db.exec, settings.get, settings.set, settings.list, settings.getString, settings.getNumber, settings.modelDefault, settings.declared, files.write, files.list, files.open, files.close, files.stat, files.exists, files.mkdir, files.remove, files.rename, events.emitAgentsChanged, tools.list, tools.call, tools.schemas, tools.validate, tools.promptSection, tools.read, tools.write, tools.edit, tools.grep, tools.bash, ui.eval, ui.action, ui.notify, ui.openAgent, ui.openFile, ui.createAgent, ui.sendToAgent, markdown.render, markdown.highlight, repl.eval, procs.repl.load, git.run, git.status, git.commit, git.push, git.stage, git.stageCommitPush, procs.dev.genTypes, procs.http.loadRoutes, procs.migrate.up]
order: 11
---
  await ctx.fns.procs.db.select({ sql, params })
  await ctx.fns.session.appendMessage({ id: agent.id, message: { role, content } })
  ctx.fns.files.read({ path })
  ctx.fns.agent.compact({ agent, summary: "kept the shape, dropped the blob" })

Zero-arg fns take an empty object:          ctx.fns.session.list({}), ctx.fns.agent.workerLoop({}).
Optional fields go inside opts:             ctx.fns.session.getMessages({ id, includeExcluded: true }).
Search runtime function docs in English:    ctx.fns.runtime.docs.search({ query: "english keywords" }).
Translate the intent to concise English keywords before searching, regardless of the user's language.
Inspect docs, params schema and return type: ctx.fns.runtime.docs.get({ name: "namespace.function" }).
Use source files when runtime documentation is insufficient; source remains the final word.

ctx shape:

  ctx.env                                   env-var snapshot
  await ctx.fns.procs.db.conn()             raw db access (usually go through ctx.fns.procs.db)
  ctx.state.agent[id]                       live agents (parent + forks), keyed by id
  ctx.state.settings.registry               declared settings registry
  ctx.state.procs.http.routes               live HTTP route table
  ctx.fns.<ns>.<fn>({ ...opts })            every procedure (ctx + session injected)

agent shape (the live object you receive):

  agent.id                                  short two-letter id
  agent.model                               "<provider>/<accountName>:<modelId>" — e.g. "claude/personal:claude-haiku-4-5", "custom/Asoft LLM Gate:vendor/model:v1"
  agent.systemPrompt                        per-agent addition on top of this prompt
  agent.messages                            OpenAI-shaped transcript (DO NOT push directly — see Hard rules)
  agent.events                              UI trace events (DO NOT push directly)
  agent.scratchpad                          plain object, persistent across turns, NOT sent to model — stash data here
  agent.parentId                            set on forks; effective transcript assembled lazily via getFullMessages
  agent.abortController                     in-flight LLM abort signal

ctx.fns namespaces:

  agent       run, compact, start, stop, clear, delegate, team, ask, steer, finishTask, archiveMember, archiveCompleted, readAndSummarize, fullSystemPrompt, buildLlmRequest, wireTools
  llm         call, stream, resolveEndpoint, listModels
  session     append*, replace*, truncate*, delete*, get*, save, load, fork, search, syncAgentState, updateScratchpad
  workspace   get ({}) → { dir, host }, set ({ dir, host? }) — the agent's working directory, local or on an SSH host; files/bash/git follow it
  procs.db    select, run, insert, exec, conn (framework Postgres layer — async, ? placeholders)
  settings    get, set, list, getString, getNumber, modelDefault, declared
  files       read, write, list, open, close, stat, exists, mkdir, remove, rename
  events      emitAgentsChanged (app wrapper; server bus is procs.events: emit, subscribe)
  tools       list, call, schemas, validate, promptSection (the $tool_ registry) + read/write/edit/grep/bash/eval
  ui          eval, action, notify, openAgent, openFile (compatibility events); createAgent, sendToAgent (server-side agent operations)
  markdown    render, highlight (shiki)
  repl        eval (hot-reload lives at procs.repl.load)
  git         run, status, commit, push, stage, stageCommitPush
  llm         stream, resolveEndpoint, listModels
  procs       framework infra: db, repl.load, dev.genTypes, http.loadRoutes, migrate.up, log, ...

Live discovery: translate intent to English, use ctx.fns.runtime.docs.search({ query }), then runtime.docs.get({ name }); Object.keys(ctx.fns.<ns>) remains useful for a raw namespace listing.

