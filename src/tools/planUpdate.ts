/**
 * Native `plan_update` adapter: creates or revises the invoking agent's visible plan.
 *
 * Binds the agent only from the trusted tool invocation. Delegates to `session.plan` when the agent has no
 * plan and to `session.updatePlan` otherwise, so validation, state preservation by id and Meta refresh are
 * identical to the eval route. Rejects unknown arguments, including any agent selector.
 * @param opts.title Short user-visible plan title; omitted keeps an existing title.
 * @param opts.tasks Ordered, non-empty tasks with stable unique ids.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Short user-visible plan title; omitted keeps an existing title. */
        title?: string;
        /** Ordered, non-empty tasks with stable unique ids. */
        tasks: Array<{
            /** Stable task id, at most 120 characters. */
            id: string;
            /** Short task title, at most 300 characters. */
            title: string;
            /** Optional detailed guidance. */
            instructions?: string;
        }>;
    },
): Promise<{ created: boolean; title: string; tasks: Array<{ id: string; title: string; status: string }>; active: string | null }> {
    const unknown = Object.keys(opts ?? {}).filter(key => !["title", "tasks"].includes(key));
    if (unknown.length) throw new Error(`plan_update: unknown argument ${unknown.join(", ")}`);
    const agent = session?.agent;
    if (!agent?.id) throw new Error("plan_update: requires a trusted agent invocation");
    if (!Array.isArray(opts.tasks) || opts.tasks.length === 0) throw new Error("plan_update: tasks must not be empty");
    // Task objects are passed through as given so the shared validator reports the same errors as eval.
    const tasks = opts.tasks.map(task => ({ id: task?.id, title: task?.title, instructions: task?.instructions }));
    // The live agent's scratchpad is kept in step with storage by every plan mutation.
    const exists = Array.isArray(agent.scratchpad?.plan?.tasks);
    const result: any = exists
        ? await ctx.fns.session.updatePlan({ agent, title: opts.title, tasks })
        : await ctx.fns.session.plan({ agent, title: opts.title, tasks });
    const plan = result.plan;
    const rows = (plan?.tasks ?? []).map((task: any) => ({ id: String(task.id), title: String(task.title), status: String(task.status) }));
    return { created: !exists, title: String(plan?.title ?? ""), tasks: rows, active: rows.find((task: any) => task.status === "active")?.id ?? null };
}
