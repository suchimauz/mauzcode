/**
 * Read the owner-authorized todo list of an agent for the chat dock.
 *
 * Applies the persistent-goal ownership checks (401 without a user session, 404 for unknown or archived
 * agents, 403 for another owner). Returns `{ todos }` with the title, paused flag and todos (id, title,
 * instructions, status) or `null` when the agent has none; timing internals are omitted.
 * @param opts.req Incoming GET request.
 * @param opts.params Exact agent id route parameter.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request. */
    req: Request;
    /** Exact agent identifier. */
    params: Record<string, string>;
}): Promise<Response> {
    const headers = { "Cache-Control": "no-store", Vary: "Cookie" };
    try {
        const agentId = opts.params.id!;
        await ctx.fns.goal.surfaceAuthorize({ req: opts.req, agentId });
        const row = (await ctx.fns.procs.db.select({ sql: "SELECT scratchpad FROM agents WHERE id=?", params: [agentId] }))[0];
        let scratchpad: Record<string, any> = {};
        try { scratchpad = JSON.parse(String(row?.scratchpad || "{}")) ?? {}; } catch { scratchpad = {}; }
        const todos = scratchpad.todos;
        if (!todos || !Array.isArray(todos.tasks)) return Response.json({ todos: null }, { headers });
        return Response.json({ todos: {
            title: String(todos.title ?? ""),
            paused: !!todos.pausedAt,
            tasks: todos.tasks.map((task: any) => ({
                id: String(task?.id ?? ""),
                title: String(task?.title ?? ""),
                instructions: String(task?.instructions ?? ""),
                status: ["pending", "active", "done"].includes(task?.status) ? task.status : "pending",
            })),
        } }, { headers });
    } catch (error) {
        const e = error as Error & { status?: number };
        return Response.json({ message: e.status ? e.message : "Todos unavailable" }, { status: e.status ?? 500, headers });
    }
}
