# Tasks

## 1. Implement confirmed goal removal

- [x] 1.1 Extend the typed goal client with `clear`; test that it sends the confirmed goal ID, revision, idle run token and CSRF token to the current agent's endpoint.
- [x] 1.2 Add the labelled action, running-state explanation and accessible confirmation to GoalDock. Test opening, keyboard cancellation and the absence of a mutation before confirmation.
- [x] 1.3 Bind submission to the confirmed snapshot, prevent duplicate submits, and refresh on success or conflict. Test successful return to the no-goal state, agent/goal changes during confirmation, server rejection and no automatic retries.

## 2. Verify chat integration

- [x] 2.1 Run the goal client and dock tests and verify existing create, edit, pause and resume flows still pass.
- [x] 2.2 Check the flow in web chat with an idle and a running agent, including creating a new goal after removal and retaining prior goal events. Verified with rendered chat components and mocked HTTP in `goal-removal.test.tsx`; no live agent data was used.
