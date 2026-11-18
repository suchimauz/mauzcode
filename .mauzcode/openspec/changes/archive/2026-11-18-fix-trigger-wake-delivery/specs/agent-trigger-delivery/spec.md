## Purpose

Defines how the prompt of a fired durable trigger (one-shot wake, cron or watch) is delivered into its agent's conversation and how that delivery causes the agent to take a turn, including while it is busy, stopped or archived.

## ADDED Requirements

### Requirement: Fired trigger starts an agent turn
When a durable trigger fires for an agent that is neither stopped nor archived and the input is authorised under any applicable task grant, the system SHALL append the trigger prompt to the agent's conversation as user input of type `trigger` and SHALL start an agent turn whose model input includes that prompt. The trigger prompt MUST count as pending input for the agent's processing cursor until a turn that consumed it finishes successfully.

#### Scenario: One-shot wake on an idle agent
- **WHEN** a one-shot wake trigger fires for an idle agent with no other pending input
- **THEN** the agent's conversation contains the trigger prompt and the agent runs a turn whose model input contains that prompt

#### Scenario: Cron tick
- **WHEN** a cron trigger fires for an idle agent
- **THEN** the agent runs a turn for that tick's prompt

### Requirement: A ready watch delivers its predicate result
The actual model input for an authorised ready watch SHALL contain the prompt and the complete serialized predicate result when it fits the inline limit (16,000 UTF-16 code units). For a larger result it SHALL contain the prompt, a bounded preview and a reference from which the agent can read the full result. If storage fails, it SHALL show the preview and state that the full result is unavailable rather than giving an invalid reference.

#### Scenario: Result fits inline
- **WHEN** a ready watch fires with a serialized result at or below the inline limit
- **THEN** the model receives the prompt and full result without needing to fetch it

#### Scenario: Result exceeds the inline limit
- **WHEN** a ready watch fires with a larger result and storage succeeds
- **THEN** the model receives the prompt, a preview and a reference that resolves to the complete result, not the full payload inline

### Requirement: Trigger delivered during a run is not lost
An authorised trigger prompt delivered while its agent is running SHALL remain pending after the current turn and SHALL cause a follow-up turn, unless the current turn already consumed it.

#### Scenario: Trigger arrives mid-run
- **WHEN** a trigger fires while the agent is in the middle of a turn that does not consume the new prompt
- **THEN** after that turn finishes the agent is scheduled again and runs a turn for the trigger prompt

#### Scenario: Legacy watch becomes ready
- **WHEN** a legacy agent watch on an agent without a required delegation is completed or times out
- **THEN** its wake-up prompt counts as pending input and the agent runs a turn for it

### Requirement: Trigger prompt is not attributed to a person
The system SHALL store a delivered trigger prompt without a human author and SHALL NOT present it to the model as a message from a named user.

#### Scenario: Multi-user install
- **WHEN** a trigger fires in an install with two or more active users
- **THEN** the trigger prompt in the model input carries no user-name prefix

### Requirement: A delegated task may wait for its own triggers
Only a child creating `wake`, `cron` or `watch` for itself under a valid task grant SHALL obtain a task-bound trigger. Ending a turn with an armed trigger or pending firing SHALL leave the unfinished task waiting. Only verified firings bound to that task SHALL qualify as trigger input beyond its original authorised frontier; they SHALL NOT authorise other messages.

#### Scenario: Child waits and resumes
- **WHEN** the child creates a wake, cron or watch, returns without finishing its task, and the trigger later fires, including after worker restart
- **THEN** a new turn under the same task sees that firing's prompt (including the predicate result as specified above for a ready watch), and only successful consumption advances the cursor

#### Scenario: External or unbound trigger
- **WHEN** a human, another agent or a legacy trigger without a task binding supplies a trigger prompt to the child after its authorised frontier
- **THEN** it blocks admission as unapproved input; no turn runs under the grant or as ordinary fallback

#### Scenario: Interleaved human input
- **WHEN** a human message arrives beyond the original frontier before or during a turn handling a task-bound firing
- **THEN** the firing does not authorise that message; the worker neither shows it to the model nor advances the cursor past it

### Requirement: A waiting task without a remaining trigger becomes blocked
When a bound trigger is cancelled or a bound watch times out without an `onTimeoutPrompt`, the unfinished waiting task SHALL become `blocked` if no other bound trigger is armed and no authorised firing is pending. The parent SHALL be able to see the reason after a restart. This transition SHALL NOT complete the task or start a model turn.

#### Scenario: Last trigger is cancelled
- **WHEN** the last bound trigger is cancelled while the child is waiting and no firing is pending
- **THEN** the task is blocked with cancellation as the parent-visible reason; restarting the worker neither clears the reason nor runs the child

#### Scenario: Last watch expires silently
- **WHEN** the task's only remaining bound trigger is a watch that expires without a timeout prompt and no authorised firing is pending
- **THEN** the task is blocked with timeout as the parent-visible reason; restarting the worker neither clears the reason nor runs the child

#### Scenario: Another source of work remains
- **WHEN** a bound trigger is cancelled or expires silently but another bound trigger remains armed or an authorised firing is pending
- **THEN** the task is not blocked by that cancellation or expiry; the remaining trigger or firing can still resume it

### Requirement: Task-bound triggers cannot outlive the task
Completion, cancellation or revocation SHALL invalidate pending and future firings for that task. A recurring trigger MAY resume the waiting child on successive firings only while the same task and grant remain valid.

#### Scenario: Recurring trigger and task end
- **WHEN** a cron or repeating watch has resumed a child and the task finishes, is cancelled or loses its grant while another firing is queued or being claimed
- **THEN** no queued or future firing starts a new turn and the recurring trigger no longer schedules work

#### Scenario: One-shot firing after task end
- **WHEN** a wake or one-shot watch becomes ready after task completion, cancellation or revocation
- **THEN** the firing does not start a turn or reopen the task

### Requirement: Trigger with an active goal runs an ordinary turn
When an authorised trigger prompt is pending for an agent with an active goal, the system SHALL run an ordinary turn for it; a goal continuation SHALL NOT replace that turn.

#### Scenario: Active goal
- **WHEN** a trigger fires for an idle agent with an active goal
- **THEN** the agent runs a turn whose model input contains the trigger prompt

### Requirement: Stopped or archived agents are not woken
A trigger SHALL NOT append its prompt or start a turn for an agent that is stopped or archived; the trigger stays deliverable according to the existing pause rules.

#### Scenario: Stopped agent
- **WHEN** a trigger becomes due for a stopped agent
- **THEN** no prompt is appended, no turn starts, and the trigger remains active

### Requirement: Delivery is idempotent per firing
Each firing SHALL be identified by a firing key and SHALL produce at most one conversation message and one delivery record, regardless of retries or worker restarts.

#### Scenario: Delivery retried
- **WHEN** delivery of a firing is retried after a failure or restart
- **THEN** the conversation contains exactly one prompt for that firing and at most one turn runs for it

### Requirement: Repeated firings are coalesced
While a prompt of a trigger is still unconsumed, a further cron tick or edge-watch firing of the same trigger SHALL NOT append another prompt; the schedule SHALL still advance.

#### Scenario: Cron ticks while the agent is paused by quota
- **WHEN** a cron fires several times while its previous prompt is still pending
- **THEN** only one prompt is pending and the agent runs one turn for it after resuming

### Requirement: Triggers do not reset the agent hop counter
A trigger prompt SHALL NOT reset or restart the agent-to-agent hop chain.

#### Scenario: Cron between agent messages
- **WHEN** an agent answering an agent message at hop N receives a trigger prompt and then sends another agent message
- **THEN** the sent message carries hop N+1, not 1

### Requirement: Task-bound triggers are limited
A task SHALL have at most 5 armed bound triggers, and a bound cron SHALL have an interval of at least one minute. Creation beyond these limits SHALL fail with an explicit error and no trigger.

#### Scenario: Sixth bound trigger
- **WHEN** a child with 5 armed bound triggers creates another one
- **THEN** creation fails and no trigger is stored

### Requirement: The parent sees waiting and blocked tasks
The parent's view of its delegated tasks SHALL show whether a task is open, waiting or blocked, and for blocked tasks the reason and time, persisted across restart.

#### Scenario: Parent inspects a waiting child
- **WHEN** the child ended its turn with an armed bound trigger
- **THEN** the parent sees the task as waiting (not finished) with the number of armed triggers

### Requirement: Existing triggers are not given task authority
The migration SHALL leave all existing triggers unbound and SHALL NOT replay already delivered prompts.

#### Scenario: Pre-migration trigger on a delegated child
- **WHEN** a trigger created before the migration fires for a delegated child after its frontier
- **THEN** it is treated as unbound and blocks admission

### Requirement: A waiting or blocked child keeps its parent goal open
A delegated task in state `waiting` or `blocked` SHALL count as outstanding for its parent goal; goal completion, clearing and external resume SHALL treat it like an open task.

#### Scenario: Parent goal with a waiting child
- **WHEN** the parent goal is evaluated for completion while a child task is waiting for its trigger
- **THEN** the goal is not completed or cleared because of that child

### Requirement: Task-bound waiting can be disabled
When the `agent.triggerTaskWait` setting is off, the system SHALL NOT bind new triggers to tasks and SHALL behave as if all triggers were unbound, while trigger prompts still start ordinary turns for agents without a task grant.

#### Scenario: Setting off
- **WHEN** a delegated child creates a wake for itself with the setting off
- **THEN** the trigger is stored unbound and its firing blocks admission instead of resuming the task
