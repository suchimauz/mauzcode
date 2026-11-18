/**
 * Pauses the agent's todo list: settles the elapsed time of every active todo and sets `pausedAt`.
 *
 * Idempotent: an absent or already paused list is left unchanged. With `scratchpad` it mutates that
 * caller-locked object in place (no storage, live state or event; the caller persists and publishes).
 * Otherwise it mutates storage; inside a caller transaction it leaves live state and the `todos` event to
 * the caller, outside one it updates a loaded agent's `todos` and emits the `todos` section.
 * @param opts.agent Live agent whose todos are paused.
 * @param opts.id Agent id when no live agent is at hand.
 * @param opts.scratchpad Caller-locked scratchpad to mutate in place.
 * @param opts.now Pause timestamp; defaults to the mutation time.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Live agent whose todos are paused; defaults to the current session agent. */
        agent?: types.agent.Agent;
        /** Agent id when no live agent is at hand. */
        id?: string;
        /** Caller-locked scratchpad to mutate in place instead of storage. */
        scratchpad?: Record<string, any>;
        /** Pause timestamp in epoch milliseconds; defaults to the mutation time. */
        now?: number;
    },
): Promise<{ ok: true; changed: boolean; scratchpad: Record<string, any> }> {
    const pause = (scratchpad: Record<string, any>, now: number) => {
        const todos = scratchpad?.todos;
        if (!todos || todos.pausedAt) return false;
        for (const task of Array.isArray(todos.tasks) ? todos.tasks : []) {
            if (task?.status !== "active" || !task.activeSince) continue;
            task.elapsedMs = Math.max(0, Number(task.elapsedMs ?? 0)) + Math.max(0, now - Number(task.activeSince));
            task.activeSince = null;
        }
        todos.pausedAt = now;
        todos.updatedAt = now;
        return true;
    };
    if (opts.scratchpad) return { ok: true, changed: pause(opts.scratchpad, opts.now ?? Date.now()), scratchpad: opts.scratchpad };
    const id = String(opts.id ?? opts.agent?.id ?? (session as any)?.agent?.id ?? "").trim();
    if (!id) throw new Error("todo.pause: agent is required");
    const updated: any = await ctx.fns.session.mutateScratchpad({ id, mutate: (scratchpad: Record<string, any>, now: number) => pause(scratchpad, opts.now ?? now) });
    if (!updated.result || ctx.state?.procs?.db?.transactionStorage?.getStore()?.active) return { ok: true, changed: !!updated.result, scratchpad: updated.scratchpad };
    const live = opts.agent ?? (ctx.state as any)?.agent?.[id];
    if (live) { live.scratchpad ??= {}; live.scratchpad.todos = updated.scratchpad.todos; }
    ctx.fns.events.refreshAgentMeta({ agentId: id, section: "todos", reason: "todos-paused" });
    return { ok: true, changed: true, scratchpad: updated.scratchpad };
}
