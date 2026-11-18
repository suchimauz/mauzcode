# Proposal

## Why

A delegated child agent always runs on its parent's model. An agent cannot send cheap, mechanical side work to a faster model or hard work to a stronger one, and cannot choose the child's reasoning effort. The only workaround is changing the child's model by hand after it has already started.

## What Changes

- `delegate_task` gains two optional arguments: `model` (exact route `provider/accountName:modelId`) and `reasoningEffort` (`auto` or a reasoning level).
- The same options are accepted by every delegation entry point: `agent.delegate` (normal and Goal paths), `session.fork` and `sharedAgent.delegate`; `agent.start` accepts an initial reasoning effort.
- Omitting `model` keeps today's behaviour: the child inherits the parent's model. Omitting `reasoningEffort` starts the child with `auto`.
- The model and effort are validated before any child is created: unknown or legacy routes, disabled providers, disabled connections, disabled models and unsupported effort levels are rejected without leaving an orphan child.
- A new read-only listing of selectable models (`models.selectable` and a native `list_models` tool) lets an agent discover valid routes and their supported reasoning levels without provider network calls or secrets.
- Model choice is not a preset permission: any enabled model on an enabled connection may be chosen; `presetId` still only narrows access.

## Capabilities

### New Capabilities

### Modified Capabilities
- `native-todo-delegation`: `delegate_task` and the other delegation entry points accept an optional child model and reasoning effort, validated before the child exists.
- `llm-model-availability`: adds a read-only listing of selectable models with their supported reasoning levels.
- `agent-presets`: states that choosing a child model is not governed by presets and does not widen access.

## Impact

- Native tool schema `src/tools/$tool_delegate_task.md` and adapter `tools.delegateTask`; new `$tool_list_models.md`.
- `agent.delegate`, `agent.publishGoalDelegation`, `session.fork`, `agent.start`, `sharedAgent.delegate`.
- New `models.selectable`; delegation prompt documentation (`$prompt_delegation.md`).
- No database migration: `agents.model` and `agents.reasoning_effort` already exist.
