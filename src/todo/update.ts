/**
 * Revises the agent's existing todo list while preserving todo state by id.
 *
 * Kept ids keep their status and timing; new ids start pending. Active and done todos cannot be removed
 * or reordered. A pending or new todo may carry `status: "active"` to start it in parallel; there is no
 * way back to pending. Active and done todos must precede pending ones.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {

        /** Agent that owns the todos; defaults to the current session agent. */
        agent?: types.agent.Agent;

        /** Short user-visible title; omitted keeps the existing title. */
        title?: string;

        /** Ordered todos; an optional `status: "active"` starts a pending or new todo now. */
        tasks: Array<{ id: string; title: string; instructions?: string; status?: "active" }>;
    },
): Promise<{ ok: true; todos: any; active: string[] }> {
    const agent = opts.agent ?? (session as any)?.agent;
    if (!agent?.id) throw new Error("todo.update: agent is required");
    if (!Array.isArray(opts.tasks) || opts.tasks.length === 0) throw new Error("todo.update: tasks must not be empty");

    const ids = new Set<string>();
    const inputs = opts.tasks.map((input, index) => {
        const id = String(input?.id ?? "").trim();
        const title = String(input?.title ?? "").trim();
        const instructions = String(input?.instructions ?? "").trim();
        const status = (input as any)?.status;
        if (!id || id.length > 120) throw new Error(`todo.update: todo ${index + 1} has an invalid id`);
        if (ids.has(id)) throw new Error(`todo.update: duplicate todo id "${id}"`);
        if (!title || title.length > 300) throw new Error(`todo.update: todo "${id}" has an invalid title`);
        if (instructions.length > 12_000) throw new Error(`todo.update: instructions for "${id}" are too long`);
        if (status !== undefined && status !== "active") throw new Error(`todo.update: todo "${id}" has an invalid status; only "active" is accepted`);
        ids.add(id);
        return { id, title, instructions, start: status === "active" };
    });

    const updated: any = await ctx.fns.session.mutateScratchpad({ id: agent.id, mutate: (scratchpad: Record<string, any>, now: number) => {
        const todos = scratchpad.todos;
        if (!todos || !Array.isArray(todos.tasks)) throw new Error("todo.update: no todo list");
        const existing = new Map<string, any>(todos.tasks.map((task: any) => [String(task.id), task]));
        const fixed = todos.tasks.filter((task: any) => task.status !== "pending");
        for (const task of fixed) {
            if (!ids.has(String(task.id))) throw new Error(`todo.update: ${task.status} todo "${task.id}" cannot be removed`);
        }
        const submittedFixed = inputs.filter(input => existing.has(input.id) && existing.get(input.id)?.status !== "pending");
        if (submittedFixed.map(input => input.id).join("\n") !== fixed.map((task: any) => String(task.id)).join("\n")) {
            throw new Error("todo.update: active/done todos cannot be reordered");
        }
        for (const input of inputs) {
            if (input.start && existing.get(input.id)?.status === "done") throw new Error(`todo.update: done todo "${input.id}" cannot be started again`);
        }
        const resulting = inputs.map(input => input.start ? "active" : (existing.get(input.id)?.status ?? "pending"));
        const firstPending = resulting.indexOf("pending");
        if (firstPending >= 0 && resulting.slice(firstPending).some(status => status !== "pending")) {
            throw new Error("todo.update: pending todos must follow active/done todos");
        }

        const paused = !!todos.pausedAt;
        todos.tasks = inputs.map(({ start, ...input }) => {
            const old: any = existing.get(input.id);
            const task = old ? { ...old, title: input.title, instructions: input.instructions } : {
                ...input,
                status: "pending",
                startedAt: null,
                activeSince: null,
                elapsedMs: 0,
                completedAt: null,
            };
            if (start && task.status === "pending") {
                task.status = "active";
                task.startedAt ??= now;
                task.activeSince = paused ? null : now;
            }
            return task;
        });
        todos.title = String(opts.title ?? todos.title ?? "").trim().slice(0, 300);
        // A completed list can be extended. The first newly added todo must
        // become active; leaving every new row pending produces a list that
        // looks saved but can never run or advance.
        if (!todos.tasks.some((task: any) => task.status === "active")) {
            const next = todos.tasks.find((task: any) => task.status === "pending");
            if (next) {
                next.status = "active";
                next.startedAt ??= now;
                next.activeSince = paused ? null : now;
            }
        }
        todos.updatedAt = now;
        return { todos, active: todos.tasks.filter((task: any) => task.status === "active").map((task: any) => String(task.id)) };
    } });
    agent.scratchpad = updated.scratchpad;
    ctx.fns.events.refreshAgentMeta({ agentId: agent.id, section: "todos", reason: "todos-updated" });
    if (agent.parentId) ctx.fns.events.refreshAgentMeta({ agentId: String(agent.parentId), section: "team", reason: "team-todos" });
    return { ok: true, ...updated.result };
}
