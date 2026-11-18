/**
 * Native `delegate_task` adapter: delegates an ordered todo list to a new child of the invoking agent.
 *
 * Binds the parent only from the trusted tool invocation and delegates to `agent.delegate`, which intersects
 * the requested preset with the parent's snapshot (never widening it), handles goal-bound parents, and
 * starts the child asynchronously. Returns the child id at once and never waits for it.
 * @param opts.title Short title for the child and its todo list.
 * @param opts.tasks Ordered, non-empty todos in the todo format.
 * @param opts.presetId Optional preset that can only narrow the parent's access.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Short title for the child and its todo list. */
        title: string;
        /** Ordered, non-empty todos in the todo format. */
        tasks: Array<{
            /** Stable task id. */
            id: string;
            /** Short task title. */
            title: string;
            /** Self-contained guidance for the child. */
            instructions?: string;
        }>;
        /** Optional preset that can only narrow the parent's access. */
        presetId?: string;
    },
): Promise<{ id: string; status: "working" }> {
    const unknown = Object.keys(opts ?? {}).filter(key => !["title", "tasks", "presetId"].includes(key));
    if (unknown.length) throw new Error(`delegate_task: unknown argument ${unknown.join(", ")}`);
    const agent = session?.agent;
    if (!agent?.id) throw new Error("delegate_task: requires a trusted agent invocation");
    if (typeof opts.title !== "string" || !opts.title.trim()) throw new Error("delegate_task: title must be a non-empty string");
    if (!Array.isArray(opts.tasks) || opts.tasks.length === 0) throw new Error("delegate_task: tasks must not be empty");
    // Validate the todos before any child exists: a bad task list must not leave an orphan fork behind.
    const ids = new Set<string>();
    opts.tasks.forEach((task, index) => {
        const id = typeof task?.id === "string" ? task.id.trim() : "";
        const title = typeof task?.title === "string" ? task.title.trim() : "";
        if (!id || id.length > 120) throw new Error(`delegate_task: task ${index + 1} has an invalid id`);
        if (ids.has(id)) throw new Error(`delegate_task: duplicate task id "${id}"`);
        if (!title || title.length > 300) throw new Error(`delegate_task: task "${id}" has an invalid title`);
        if (task.instructions !== undefined && (typeof task.instructions !== "string" || task.instructions.length > 12_000)) throw new Error(`delegate_task: instructions for "${id}" are invalid`);
        ids.add(id);
    });
    if (opts.presetId !== undefined && (typeof opts.presetId !== "string" || !opts.presetId.trim())) throw new Error("delegate_task: presetId must be a non-empty string");
    const tasks = opts.tasks.map(task => ({ id: task.id.trim(), title: task.title.trim(), ...(task.instructions?.trim() ? { instructions: task.instructions.trim() } : {}) }));
    const child = await ctx.fns.agent.delegate({ agent, title: opts.title.trim(), tasks, ...(opts.presetId ? { presetId: opts.presetId.trim() } : {}) });
    return { id: child.id, status: child.status };
}
