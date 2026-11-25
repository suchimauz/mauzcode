/**
 * Append newly advertised skill descriptors at a safe replying request boundary.
 *
 * Recover cumulative window spend from scoped durable catalogue rows, never from ordinary history or tool output. Persist only newly shown metadata; the row itself is the atomic delivery receipt.
 * @param opts.agent Live agent with synchronized full history, the current workspace and creation-time preset.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Live agent with synchronized full history, the current workspace and creation-time preset. */
        agent: types.agent.Agent;
    },
): Promise<boolean> {
    const { agent } = opts;
    if (!await ctx.fns.skills.promptSection({ agent })) return false;
    const history = agent.messages;
    const workspace = { host: agent.workspaceHost ?? '', dir: agent.workspaceDir };
    const digest = (text: string) => new Bun.CryptoHasher('sha256').update(text).digest('hex');
    const scope = digest(JSON.stringify([workspace.host, workspace.dir]));
    // A generation may retain older catalogue rows in its tail. Only rows written
    // AFTER its canonical source frontier belong to this generation's allowance.
    const request = (ctx as Context & { goalRequestContext?: { agentId: string; omitGoalContinuationIdxs: readonly number[] } }).goalRequestContext;
    let start = 0;
    if (agent.sleepContext && !(request?.agentId === agent.id && request.omitGoalContinuationIdxs.length)) {
        const projection = await ctx.fns.compaction.project({ model: ctx.fns.agent.requireModel({ model: agent.model, agentId: agent.id }), messages: history, sleepContext: agent.sleepContext });
        if (projection.mode === 'compact') {
            const generation = ctx.fns.agent.getSleepGeneration({ sleepContext: agent.sleepContext, revision: projection.revision });
            start = Number(generation.sourceOffset ?? generation.sourceFrontier);
        }
    }
    const shown = new Map<string, string>();
    let spent = 0;
    const pending = new Set<string>();
    for (const row of history.slice(start)) {
        if (row.role === 'assistant') {
            // A subsequent assistant turn already passed any historical orphan via
            // outbound tool-pair repair. Only an unclosed current batch can be split.
            pending.clear();
            for (const call of row.tool_calls ?? []) pending.add(call.id);
        } else if (row.role === 'tool' && row.tool_call_id) pending.delete(row.tool_call_id);
        if (row.message_type !== 'skill_catalogue' || row.role !== 'user' || !row.skill_scope || typeof row.content !== 'string') continue;
        for (const line of row.content.split('\n').slice(1, -1)) {
            const id = /^- (skill\.[^ ]+) /.exec(line)?.[1];
            if (!id) continue;
            shown.set(row.skill_scope + ':' + id, line);
            spent += line.length + 1;
        }
    }
    if (pending.size || spent >= 6000) return false;
    const policy = await ctx.fns.skills.policy({ snapshot: agent.preset, reader: 'skills.list', workspace });
    if (!policy.ok) return false;
    const field = (value: string, max: number) => {
        const flat = value.replace(/[\u0000-\u001f<>]+/g, ' ').replace(/\s+/g, ' ').trim();
        return (flat.length <= max ? flat : flat.slice(0, max - 1) + '…').toWellFormed();
    };
    const lines: string[] = [];
    const priorSpend = spent;
    // skills.catalogue already orders the authorized descriptors by canonical ID.
    for (const { descriptor: d } of policy.entries) {
        const key = scope + ':' + d.id; // qualified IDs include supplying source and root/plugin qualifier
        const line = '- ' + d.id + ' (' + field(d.sourceLabel, 60) + '): ' + field(d.description, 300);
        if (shown.get(key) === line || (!shown.has(key) && shown.size >= 40) || spent + line.length + 1 > 6000) continue;
        lines.push(line);
        shown.set(key, line);
        spent += line.length + 1;
    }
    if (!lines.length || workspace.host !== (agent.workspaceHost ?? '') || workspace.dir !== agent.workspaceDir) return false;
    const content = ['<available-skills>', ...lines, '</available-skills>'].join('\n');
    const receipt = await ctx.fns.session.appendMessage({ id: agent.id,
        clientRequestId: 'skill-catalogue:' + digest(JSON.stringify([start, scope, priorSpend, content])),
        message: { role: 'user', message_type: 'skill_catalogue', content, skill_scope: scope, author: null, excluded_from_cursor: true },
    });
    await ctx.fns.session.syncAgentState({ agent });
    return !receipt.duplicate;
}
