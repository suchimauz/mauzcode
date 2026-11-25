/**
 * Persist current collaboration-mode guidance once when it is absent from the effective transcript.
 * Compare the latest visible planning_context row in the selected checkpoint and retained fork or root
 * history. Full-history fallback must not create duplicates. Never split a trailing tool-call batch.
 * @param opts.agent Live agent whose planning context row is synchronized before a provider request.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Live agent whose planning context row is synchronized. */
        agent: types.agent.Agent;
    },
): Promise<{ appended: boolean; reason: 'first' | 'changed' | 'unchanged' | 'tool_call_tail' }> {
    const { agent } = opts;
    const history: types.session.Message[] = agent.parentId
        ? await ctx.fns.session.getFullMessages({ id: agent.id }) : agent.messages ?? [];
    const results = new Set<string>();
    let i = history.length - 1;
    for (; i >= 0 && history[i]?.role === 'tool'; i--) {
        const id = history[i]?.tool_call_id;
        if (id) results.add(id);
    }
    const caller = history[i];
    if (caller?.role === 'assistant' && caller.tool_calls?.some(call => !results.has(call.id))) {
        return { appended: false, reason: 'tool_call_tail' };
    }

    // Scoped goal requests deliberately bypass checkpoints in buildLlmRequest. Leave their
    // request-only authority filtering there; do not restore rows for a checkpoint they won't use.
    const scope = (ctx as Context & { goalRequestContext?: { agentId: string; authority?: unknown; omitGoalContinuationIdxs: readonly number[] } }).goalRequestContext;
    const bypass = scope?.agentId === agent.id && (scope.authority || scope.omitGoalContinuationIdxs.length);
    const visible = agent.sleepContext && !bypass
        ? (await ctx.fns.compaction.project({ model: ctx.fns.agent.requireModel({ model: agent.model, agentId: agent.id }), messages: history, sleepContext: agent.sleepContext })).messages
        : history;
    let previous: string | null = null;
    for (let j = visible.length - 1; j >= 0; j--) {
        if (visible[j]?.message_type !== 'planning_context') continue;
        previous = String(visible[j]?.content ?? '');
        break;
    }
    const content = await ctx.fns.planning.prompt({ agentId: agent.id });
    if (previous === content) return { appended: false, reason: 'unchanged' };
    await ctx.fns.session.appendMessage({ id: agent.id, message: { role: 'user', content, excluded_from_cursor: true, message_type: 'planning_context' } });
    await ctx.fns.session.syncAgentState({ agent });
    return { appended: true, reason: previous === null ? 'first' : 'changed' };
}
