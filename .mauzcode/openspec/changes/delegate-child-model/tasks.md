# Tasks

## 1. Plumbing

- [ ] 1.1 `agent.start`: accept optional `reasoningEffort` (default `auto`) and store it on the new agent
- [ ] 1.2 `session.fork`: accept optional `model` and `reasoningEffort`, pass them to `agent.start`; default to the parent's model and `auto`

## 2. Validation

- [ ] 2.1 Add a shared helper (e.g. `agent.resolveChildModel`) that resolves the route, asserts provider/connection/model availability and checks the effort against the cached catalogue
- [ ] 2.2 Error messages name the rejected route or level and point to `list_models`

## 3. Delegation entry points

- [ ] 3.1 `agent.delegate`: accept `model`/`reasoningEffort`, validate before fork, pass through (normal path)
- [ ] 3.2 `agent.publishGoalDelegation`: same for the Goal path, validated before the transaction
- [ ] 3.3 `sharedAgent.delegate`: accept and pass through the same options
- [ ] 3.4 `tools.delegateTask` and `$tool_delegate_task.md`: add both arguments to the schema and allowed-argument list
- [ ] 3.5 Record a visible transcript event in the child with the chosen model and effort when set explicitly

## 4. Discovery

- [ ] 4.1 Add `models.selectable` (cache-only, enabled providers/connections/models, `{ route, label, reasoning }`, no secrets)
- [ ] 4.2 Add native tool `$tool_list_models.md` gated by `requires: [models.selectable]`
- [ ] 4.3 Update `$prompt_delegation.md` with `model`, `reasoningEffort` and `list_models`

## 5. Tests

- [ ] 5.1 Omitted model/effort: child inherits parent model and starts with `auto`
- [ ] 5.2 Valid route and effort are applied to the child
- [ ] 5.3 Unknown route, disabled provider, disabled connection and disabled model are rejected and no child is created
- [ ] 5.4 Unsupported effort is rejected and no child is created
- [ ] 5.5 Goal path and `sharedAgent.delegate` honour the options
- [ ] 5.6 `delegate_task` still rejects unknown arguments
- [ ] 5.7 `models.selectable` excludes disabled entries and makes no provider request
