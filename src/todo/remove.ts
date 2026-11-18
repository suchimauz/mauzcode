/**
 * Removes the agent's todo list.
 *
 * By default the list is archived to `todoHistory` (newest first, at most 20) with the time of every
 * active todo settled; `archive: false` deletes it without archiving.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent that owns the todos; defaults to the current session agent. */
        agent?: types.agent.Agent;
        /** Whether the removed list is archived to the todo history. @default true */
        archive?: boolean;
    },
): Promise<{ ok: boolean; archived: boolean }> {
    const agent = opts.agent ?? (session as any)?.agent;
    if (!agent?.id) throw new Error("todo.remove: agent is required");
    const archive = opts.archive !== false;
    const updated: any = await ctx.fns.session.mutateScratchpad({ id: agent.id, mutate: (scratchpad: Record<string, any>, now: number) => {
        const todos = scratchpad.todos;
        if (!todos) return { archived: false };
        if (archive) {
            for (const task of Array.isArray(todos.tasks) ? todos.tasks : []) {
                if (task?.status !== "active" || !task.activeSince) continue;
                task.elapsedMs = Math.max(0, Number(task.elapsedMs ?? 0)) + Math.max(0, now - Number(task.activeSince));
                task.activeSince = null;
            }
            const history = Array.isArray(scratchpad.todoHistory) ? scratchpad.todoHistory : [];
            scratchpad.todoHistory = [{ ...todos, archivedAt: now }, ...history].slice(0, 20);
        }
        delete scratchpad.todos;
        return { archived: archive };
    } });
    agent.scratchpad = updated.scratchpad;
    ctx.fns.events.refreshAgentMeta({ agentId: agent.id, section: "todos", reason: updated.result.archived ? "todos-archived" : "todos-deleted" });
    if (agent.parentId) ctx.fns.events.refreshAgentMeta({ agentId: String(agent.parentId), section: "team", reason: "team-todos" });
    return { ok: true, archived: updated.result.archived };
}
