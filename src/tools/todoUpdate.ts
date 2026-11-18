/**
 * Native `todo_update` adapter: creates or revises the invoking agent's visible todo list.
 *
 * Binds the agent only from the trusted tool invocation. Delegates to `todo.create` when the agent has no
 * todos and to `todo.update` otherwise, so validation, state preservation by id and live refresh are
 * identical to the eval route. Rejects unknown arguments, including any agent selector.
 * @param opts.title Short user-visible title; omitted keeps an existing title.
 * @param opts.tasks Ordered, non-empty todos with stable unique ids.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Short user-visible title; omitted keeps an existing title. */
        title?: string;
        /** Ordered, non-empty todos with stable unique ids. */
        tasks: Array<{
            /** Stable todo id, at most 120 characters. */
            id: string;
            /** Short todo title, at most 300 characters. */
            title: string;
            /** Optional detailed guidance. */
            instructions?: string;
            /** Optional "active" to start a pending or new todo now, in parallel with other active todos. */
            status?: "active";
        }>;
    },
): Promise<{ created: boolean; title: string; tasks: Array<{ id: string; title: string; status: string }>; active: string[] }> {
    const unknown = Object.keys(opts ?? {}).filter(key => !["title", "tasks"].includes(key));
    if (unknown.length) throw new Error(`todo_update: unknown argument ${unknown.join(", ")}`);
    const agent = session?.agent;
    if (!agent?.id) throw new Error("todo_update: requires a trusted agent invocation");
    if (!Array.isArray(opts.tasks) || opts.tasks.length === 0) throw new Error("todo_update: tasks must not be empty");
    // Todo objects are passed through as given so the shared validator reports the same errors as eval.
    const tasks = opts.tasks.map(task => ({
        id: task?.id,
        title: task?.title,
        instructions: task?.instructions,
        ...(task?.status !== undefined ? { status: task.status } : {}),
    }));
    // The live agent's scratchpad is kept in step with storage by every todo mutation.
    const exists = Array.isArray(agent.scratchpad?.todos?.tasks);
    const result: any = exists
        ? await ctx.fns.todo.update({ agent, title: opts.title, tasks })
        : await ctx.fns.todo.create({ agent, title: opts.title, tasks });
    const todos = result.todos;
    const rows = (todos?.tasks ?? []).map((task: any) => ({ id: String(task.id), title: String(task.title), status: String(task.status) }));
    return { created: !exists, title: String(todos?.title ?? ""), tasks: rows, active: rows.filter((task: any) => task.status === "active").map((task: any) => task.id) };
}
