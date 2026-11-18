/**
 * Delegates one task to a published session's accumulated context
 *
 * Forks a published source session at its current transcript, creates a one-todo list, and queues a child agent. Use after sharedAgent.list identifies a context agent suited to the requested task. An optional exact model route and reasoning effort are validated before the child exists; an omitted model inherits the source agent's route and an omitted effort means auto.
 * @param opts.agentId Published source agent identifier returned by sharedAgent.list.
 * @param opts.task Concrete task to execute using the published session context.
 * @param opts.requesterId Optional requesting agent identifier recorded for audit.
 * @param opts.model Optional exact provider/accountName:modelId route for the child.
 * @param opts.reasoningEffort Optional child reasoning preference; omitted means auto.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Published source agent identifier returned by sharedAgent.list. */
        agentId: string;
        /** Optional preset to narrow the published source agent's snapshot. */
        presetId?: string;
        /** Concrete task to execute using the published session context. */
        task: string;
        /** Optional requesting agent identifier recorded for audit. */
        requesterId?: string;
        /** Optional exact provider/accountName:modelId route for the child; omitted inherits the source agent's model. */
        model?: string;
        /** Optional child reasoning preference; omitted means auto. */
        reasoningEffort?: types.models.ReasoningLevel | "auto";
    },
): Promise<{ childId: string; sourceAgentId: string; status: 'working' }> {
    const sourceAgentId = String(opts.agentId ?? "").trim();
    const task = String(opts.task ?? "").trim();
    if (!sourceAgentId || !task) throw new Error("sharedAgent.delegate: agentId and task are required");
    const cards = await ctx.fns.procs.db.select({ sql: "SELECT value FROM kv WHERE key = ?", params: ["shared-agent:" + sourceAgentId] }) as any[];
    if (!cards.length) throw new Error("sharedAgent.delegate: context agent is not published");
    let card: any;
    try { card = JSON.parse(String(cards[0].value)); } catch { throw new Error("sharedAgent.delegate: invalid registry card"); }
    const source = (ctx.state as any).agent?.[sourceAgentId] ?? await ctx.fns.session.load({ id: sourceAgentId });
    if (!source) throw new Error("sharedAgent.delegate: source agent not found");
    const title = String(card.name || source.title || sourceAgentId).slice(0, 80) + ": " + task.slice(0, 80);
    // Validate before the fork so a rejected choice leaves no child behind.
    const resolved = await ctx.fns.agent.resolveChildModel({ model: opts.model, reasoningEffort: opts.reasoningEffort, parentModel: source.model });
    const explicit = !!opts.model || !!opts.reasoningEffort;
    const child = await ctx.fns.session.fork({ id: sourceAgentId, presetId: opts.presetId, title, visibility: "team", ...(opts.model ? { model: resolved.model } : {}), ...(explicit && opts.reasoningEffort ? { reasoningEffort: resolved.reasoningEffort } : {}) });
    if (explicit) {
        await ctx.fns.session.appendEvent({ id: child.id, event: { type: "child_model_selected", model: resolved.model, reasoningEffort: resolved.reasoningEffort, inheritedModel: source.model ?? null, explicitModel: !!opts.model, explicitReasoningEffort: !!opts.reasoningEffort } });
    }
    child.scratchpad = { ...(child.scratchpad ?? {}), sharedAgentTask: { sourceAgentId, requesterId: String(opts.requesterId ?? "").trim() || null, task, createdAt: Date.now() }, delegation: { parentId: sourceAgentId, status: "working", title, createdAt: Date.now() } };
    await ctx.fns.session.updateScratchpad({ id: child.id, scratchpad: child.scratchpad });
    await ctx.fns.todo.create({ agent: child, title, tasks: [{ id: "task", title: task, instructions: "Use the inherited source-session context. Return only information needed by the requester." }] });
    const prompt = ["You are a shared context agent executing a delegated task.", "Use the inherited session context as background, but do not reveal unrelated private transcript content.", "Complete the active todo, call todo.done({ agent, id: 'task' }), then call agent.finishTask({ agent, summary, result }) with a concrete JSON-compatible result.", "", "Task:", task].join("\n");
    await ctx.fns.session.appendUserMessage({ id: child.id, text: prompt, ...(opts.requesterId ? { author: "agent:" + opts.requesterId, eventExtra: { agentMessage: { from: opts.requesterId, body: prompt } } } : {}) });
    const now = Date.now();
    await ctx.fns.procs.db.run({ sql: "UPDATE agents SET next_run_at = COALESCE(next_run_at, ?), updated_at = ? WHERE id = ? AND archived_at IS NULL", params: [now, now, child.id] });
    ctx.fns.agent.wakeWorker({});
    ctx.fns.events.refreshAgentMeta({ agentId: sourceAgentId, section: "team", reason: "shared-agent-delegate" });
    return { childId: child.id, sourceAgentId, status: "working" as const };
}
