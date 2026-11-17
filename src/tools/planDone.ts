/**
 * Native `plan_done` adapter: marks the active task of the invoking agent's plan done.
 *
 * Binds the agent only from the trusted tool invocation and delegates to `session.done`, so idempotent
 * repeats, rejection of pending or unknown ids, parent updates and the task-done hook are unchanged.
 * @param opts.id Id of the active task to complete.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Id of the active task to complete. */
        id: string;
    },
): Promise<{ completed: { id: string; title: string }; alreadyDone: boolean; next: { id: string; title: string; instructions?: string } | null; complete: boolean; progress: { done: number; total: number } }> {
    const unknown = Object.keys(opts ?? {}).filter(key => key !== "id");
    if (unknown.length) throw new Error(`plan_done: unknown argument ${unknown.join(", ")}`);
    const agent = session?.agent;
    if (!agent?.id) throw new Error("plan_done: requires a trusted agent invocation");
    if (typeof opts.id !== "string" || !opts.id.trim()) throw new Error("plan_done: id must be a non-empty string");
    const result = await ctx.fns.session.done({ agent, id: opts.id });
    const next = result.next ? { id: result.next.id, title: result.next.title, ...(result.next.instructions ? { instructions: result.next.instructions } : {}) } : null;
    return { completed: { id: result.completed.id, title: result.completed.title }, alreadyDone: !!result.alreadyDone, next, complete: !!result.complete, progress: result.progress };
}
