/** Resolve visible declarations and their current availability for discovery or dispatch.
 * Static flags are evaluated before preset filtering, without invoking plugin code. Only visible,
 * statically enabled commands may run a dynamic check, concurrently with a 500 ms deadline.
 * @param opts.agentId Existing agent; omit for the new-session composer (static checks only).
 * @param opts.name Exact full name to resolve for dispatch; omit to discover all commands.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Existing agent; omit for the new-session composer. */ agentId?: string;
    /** Resolve only this full name instead of the whole catalogue. */ name?: string;
}): Promise<Array<{command: types.commands.Command; enabled: boolean; reason?: string; code?: string}>> {
    let workspace: Pick<types.agent.Agent, 'workspaceDir' | 'workspaceHost'> | undefined;
    let snapshot: types.agentPreset.Snapshot | undefined;
    let busy = false;
    if (opts.agentId) {
        // Do not hydrate the transcript to list commands. Read queue state from its durable owner.
        const [row] = await ctx.fns.procs.db.select({sql: 'SELECT archived_at, run_state, next_run_at, workspace_dir, workspace_host, preset_snapshot FROM agents WHERE id=?', params: [opts.agentId]});
        if (!row) throw Object.assign(new Error('Agent not found'), {status: 404, code: 'not_found'});
        if (row.archived_at != null) throw Object.assign(new Error('Restore this archived chat first'), {status: 409, code: 'archived'});
        const live = ctx.state.agent?.[opts.agentId];
        workspace = {workspaceDir: row.workspace_dir || process.cwd(), workspaceHost: row.workspace_host || ''};
        snapshot = live?.preset ?? (typeof row.preset_snapshot === 'string' ? JSON.parse(row.preset_snapshot) : row.preset_snapshot);
        // Older sessions without a snapshot use the shipped Creator rules, as in session.load.
        if (!snapshot) {
            const p = ctx.fns.agentPreset.defaults({}).find(item => item.id === 'creator')!;
            snapshot = {presetId: p.id, name: p.name, layers: [{id: p.id, allow: p.allow, deny: p.deny, plugins: p.plugins, excludeSections: p.exclude_sections, prompt: p.prompt}]};
        }
        busy = row.run_state === 'running' || row.run_state === 'claimed' || !!live?.isStreaming || (live?.activeRunCount ?? 0) > 0
            || (row.next_run_at != null && !await ctx.fns.input.isWaiting({agentId: opts.agentId}));
    }
    const registry = ctx.state.commands.registry ?? {};
    const external = !opts.name || /^(project|user):/.test(opts.name) ? await ctx.fns.commands.workspaceCommands({agent: workspace}) : [];
    const declarations = [...Object.values(registry), ...external];
    const allows = ctx.fns.agentPreset.predicate({snapshot});
    const visible = declarations.filter(command => !opts.name || command.name === opts.name).map(command => {
        if (!workspace && command.requiresSession) return {command, enabled: false, code: 'session_required', reason: 'Requires an existing session'};
        if (busy && command.blockWhileRunning) return {command, enabled: false, code: 'agent_running', reason: 'Stop the current or queued run first'};
        return {command, enabled: true};
    }).filter(({command}) => command.builtin || !allows || ((!command.fn || allows(command.fn)) && (!command.available || allows(command.available))));
    return Promise.all(visible.map(async entry => {
        const {command} = entry;
        if (!opts.agentId || !entry.enabled || !command.available) return entry;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const check = command.available.split('.').reduce<any>((ns, key) => ns?.[key], ctx.fns);
            const result = await Promise.race([
                Promise.resolve().then(() => check({agentId: opts.agentId, command})),
                new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 500); }),
            ]);
            if (result?.enabled === true) return entry;
            return {command, enabled: false, code: 'command_unavailable', reason: typeof result?.reason === 'string' && result.reason ? result.reason : 'Command unavailable'};
        } catch {
            // An exception can contain credentials or internal paths: don't expose it to clients.
            return {command, enabled: false, code: 'command_unavailable', reason: 'Availability check failed or timed out'};
        } finally {
            if (timer !== undefined) clearTimeout(timer);
        }
    }));
}
