/**
 * Native `todo_done` adapter: marks an active todo of the invoking agent done.
 *
 * Binds the agent only from the trusted tool invocation and delegates to `todo.done`, so idempotent
 * repeats, rejection of pending or unknown ids, parent updates and the task-done hook are unchanged.
 * @param opts.id Id of the active todo to complete.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Id of the active todo to complete. */
        id: string;
    },
): Promise<{
    completed: { id: string; title: string };
    alreadyDone: boolean;
    active: Array<{ id: string; title: string; instructions?: string }>;
    next: { id: string; title: string; instructions?: string } | null;
    complete: boolean;
    progress: { done: number; total: number };
}> {
    const unknown = Object.keys(opts ?? {}).filter(key => key !== "id");
    if (unknown.length) throw new Error(`todo_done: unknown argument ${unknown.join(", ")}`);
    const agent = session?.agent;
    if (!agent?.id) throw new Error("todo_done: requires a trusted agent invocation");
    if (typeof opts.id !== "string" || !opts.id.trim()) throw new Error("todo_done: id must be a non-empty string");
    const result = await ctx.fns.todo.done({ agent, id: opts.id });
    return {
        completed: { id: result.completed.id, title: result.completed.title },
        alreadyDone: !!result.alreadyDone,
        active: result.active,
        next: result.next,
        complete: !!result.complete,
        progress: result.progress,
    };
}
