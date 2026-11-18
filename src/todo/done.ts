/**
 * Marks an active todo of the agent done and returns progress.
 *
 * Settles the todo's elapsed time. When no todo remains active, the first pending todo is activated and
 * returned as `next`. Completing a done todo is idempotent; a pending or unknown id fails.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent that owns the todos; defaults to the current session agent. */
        agent?: types.agent.Agent;
        /** Id of the active todo to complete. */
        id: string;
    },
): Promise<{
    ok: true;
    alreadyDone: boolean;
    completed: { id: string; title: string; elapsedMs: number };
    active: Array<{ id: string; title: string; instructions?: string }>;
    next: { id: string; title: string; instructions?: string } | null;
    complete: boolean;
    progress: { done: number; total: number };
}> {
    const agent = opts.agent ?? (session as any)?.agent;
    if (!agent?.id) throw new Error("todo.done: agent is required");
    const id = String(opts.id ?? "").trim();
    if (!id) throw new Error("todo.done: id is required");

    const updated: any = await ctx.fns.session.mutateScratchpad({ id: agent.id, mutate: (scratchpad: Record<string, any>, now: number) => {
        const todos = scratchpad.todos;
        if (!todos || !Array.isArray(todos.tasks)) throw new Error("todo.done: no todo list");
        const task = todos.tasks.find((item: any) => item?.id === id);
        if (!task) throw new Error(`todo.done: unknown todo id "${id}"`);
        const alreadyDone = task.status === "done";
        if (!alreadyDone) {
            if (task.status !== "active") throw new Error(`todo.done: todo "${id}" is not active`);
            if (task.activeSince) task.elapsedMs = Math.max(0, Number(task.elapsedMs ?? 0)) + Math.max(0, now - Number(task.activeSince));
            task.activeSince = null;
            task.completedAt = now;
            task.status = "done";
        }

        let next: any = null;
        if (!todos.tasks.some((item: any) => item.status === "active")) {
            next = todos.tasks.find((item: any) => item.status === "pending") ?? null;
            if (next) {
                next.status = "active";
                next.startedAt ??= now;
                next.activeSince = now;
            }
        }
        // Completing a todo is agent activity: the list is running again, so
        // every active todo that a stop had paused restarts its timer.
        if (todos.pausedAt) {
            for (const item of todos.tasks) if (item.status === "active" && !item.activeSince) item.activeSince = now;
        }
        todos.updatedAt = now;
        todos.pausedAt = null;
        const view = (item: any) => ({ id: item.id, title: item.title, ...(item.instructions ? { instructions: item.instructions } : {}) });
        const active = todos.tasks.filter((item: any) => item.status === "active").map(view);
        const done = todos.tasks.filter((item: any) => item.status === "done").length;
        return {
            alreadyDone,
            completed: { id: task.id, title: task.title, elapsedMs: task.elapsedMs },
            active,
            next: next ? view(next) : null,
            complete: active.length === 0,
            progress: { done, total: todos.tasks.length },
        };
    } });
    agent.scratchpad = updated.scratchpad;
    ctx.fns.events.refreshAgentMeta({ agentId: agent.id, section: "todos", reason: "todo-done" });
    if (!updated.result.alreadyDone && agent.parentId && agent.scratchpad?.delegation) {
        await ctx.fns.agent.steer({
            from: agent,
            // The final todo is announced by finishTask with its mandatory
            // semantic result. Emitting a generic todos.completed here would
            // duplicate the parent update and wake.
            event: "task.completed",
            taskId: updated.result.completed.id,
            taskTitle: updated.result.completed.title,
            summary: updated.result.complete
                ? `Completed final todo ${updated.result.progress.done}/${updated.result.progress.total}; preparing required result.`
                : `Completed todo ${updated.result.progress.done}/${updated.result.progress.total}.`,
        });
    }
    if (agent.parentId) ctx.fns.events.refreshAgentMeta({ agentId: String(agent.parentId), section: "team", reason: "team-todo-done" });
    // The only moment when "a unit of work ended" is known rather than guessed:
    // the agent said so. Announced, not awaited — a handler that harvests the
    // transcript may cost an LLM round trip, and closing a todo must not wait
    // for it or fail with it.
    if (!updated.result.alreadyDone) {
        const completed = updated.result.completed;
        queueMicrotask(() => ctx.fns.procs.hooks.run({
            name: "todo.taskDone",
            opts: {
                agentId: agent.id,
                taskId: completed.id,
                taskTitle: completed.title,
                elapsedMs: completed.elapsedMs,
                complete: updated.result.complete,
                next: updated.result.next?.id ?? null,
                active: updated.result.active.map((item: any) => String(item.id)),
            },
        }).catch((error: any) => ctx.fns.procs.log.warn({ event: "todo.task-done.hook", msg: String(error?.message ?? error), agentId: agent.id, taskId: completed.id })));
    }
    return { ok: true, ...updated.result };
}
