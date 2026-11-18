# Design

## Context

`frontend/src/lib/goal.ts` omits `clear`, although the persistent-goal endpoint already checks authorization, CSRF, identity, revision and idle ownership. `/goal` opens an editor rather than dispatching lifecycle commands.

## Goals / Non-Goals

Expose that existing contract in GoalDock. Do not add a command, modify backend guards, change history or automatically stop an agent.

## Decisions

Use a labelled action and a keyboard-accessible confirmation describing the displayed objective, rather than treating empty editor text as deletion. Bind confirmation to agent, goal ID and revision. Invalidate it if the snapshot changes. Submit `clear` once via the existing client with the confirmed snapshot and null run token. Refresh the authoritative state after success. On conflict or ambiguous failure, refresh and require fresh confirmation before any retry.

## Risks / Trade-offs

Polling can show an idle agent just before a run starts. Disable removal for a known running owner, explain why, and rely on the server barrier for races and outstanding delegated work. Confirmation costs a click but prevents unintended removal.
