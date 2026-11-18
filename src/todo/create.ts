/**
 * Creates the visible todo list of an agent, replacing an existing list without archiving it.
 *
 * Todo IDs are stable identifiers used by `todo.done` and `todo.update`. The first todo and every todo
 * marked `status: "active"` start active; the rest stay pending. Active todos must precede pending ones.
 */

export default async function (
    ctx: Context,
    session: Session | null,
    opts: {

        /** Agent that owns the todos; defaults to the current session agent. */
        agent?: types.agent.Agent;

        /** Short user-visible title of the todo list. */
        title?: string;
        /** Persist only for an unpublished child in a caller-owned transaction; caller publishes after commit. @default false */
        deferPublication?: boolean;

        /** Ordered todos; the first todo becomes active immediately. */
        tasks: Array<{

            /** Stable todo identifier. */
            id: string;

            /** Short user-visible todo title. */
            title: string;

            /** Detailed execution guidance. */
            instructions?: string;

            /** Optional `"active"` to start this todo in parallel with the first one; it must not follow a pending todo. */
            status?: "active";
        }>;
    },
): Promise<{ ok: true; todos: any; active: string[] }> {
    const agent = opts.agent ?? (session as any)?.agent;
    if (!agent?.id) throw new Error("todo.create: agent is required");
    if (opts.deferPublication && (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active || ctx.state.agent?.[agent.id])) throw new Error("todo.create: deferred todos require an unpublished child and active transaction");
    if (!Array.isArray(opts.tasks) || opts.tasks.length === 0) throw new Error("todo.create: tasks must not be empty");

    const ids = new Set<string>();
    const inputs = opts.tasks.map((input, index) => {
        const id = String(input?.id ?? "").trim();
        const title = String(input?.title ?? "").trim();
        const instructions = String(input?.instructions ?? "").trim();
        const status = (input as any)?.status;
        if (!id || id.length > 120) throw new Error(`todo.create: todo ${index + 1} has an invalid id`);
        if (ids.has(id)) throw new Error(`todo.create: duplicate todo id "${id}"`);
        if (!title || title.length > 300) throw new Error(`todo.create: todo "${id}" has an invalid title`);
        if (instructions.length > 12_000) throw new Error(`todo.create: instructions for "${id}" are too long`);
        if (status !== undefined && status !== "active") throw new Error(`todo.create: todo "${id}" has an invalid status; only "active" is accepted`);
        ids.add(id);
        return { id, title, instructions, active: index === 0 || status === "active" };
    });
    const firstPending = inputs.findIndex(input => !input.active);
    if (firstPending >= 0 && inputs.slice(firstPending).some(input => input.active)) {
        throw new Error("todo.create: pending todos must follow active todos");
    }

    const updated: any = await ctx.fns.session.mutateScratchpad({ id: agent.id, mutate: (scratchpad: Record<string, any>, now: number) => {
        const tasks = inputs.map(({ active, ...input }) => ({
            ...input,
            status: active ? "active" : "pending",
            startedAt: active ? now : null,
            activeSince: active ? now : null,
            elapsedMs: 0,
            completedAt: null,
        }));
        const todos = {
            version: 1,
            title: String(opts.title ?? "").trim().slice(0, 300),
            tasks,
            createdAt: now,
            updatedAt: now,
            pausedAt: null,
        };
        scratchpad.todos = todos;
        return { todos, active: tasks.filter(task => task.status === "active").map(task => task.id) };
    } });
    agent.scratchpad = updated.scratchpad;
    if (opts.deferPublication) return { ok: true, ...updated.result };
    ctx.fns.events.refreshAgentMeta({ agentId: agent.id, section: "todos", reason: "todos" });
    if (agent.parentId) ctx.fns.events.refreshAgentMeta({ agentId: String(agent.parentId), section: "team", reason: "team-todos" });
    return { ok: true, ...updated.result };
}
