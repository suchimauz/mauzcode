/** Resolve visible declarations and their current availability for discovery or dispatch.
 * Static flags are evaluated before preset filtering, without invoking plugin code. Only visible,
 * statically enabled commands may run a dynamic check, concurrently with a 500 ms deadline.
 * Skill entries are derived from the packages the chat (or the selected new-chat project and preset) may read.
 * @param opts.agentId Existing agent; omit for the new-session composer (static checks only).
 * @param opts.name Exact full name to resolve for dispatch; omit to discover all commands.
 * @param opts.projectId New-session project chosen in the composer; ignored with agentId. Skills need it or an agent.
 * @param opts.presetId New-session preset; omitted uses the configured default. Ignored with agentId.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Existing agent; omit for the new-session composer. */ agentId?: string;
    /** Resolve only this full name instead of the whole catalogue. */ name?: string;
    /** New-session project chosen in the composer; ignored with agentId. */ projectId?: string;
    /** New-session preset; omitted uses the configured default. Ignored with agentId. */ presetId?: string;
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
    // A new chat discovers skills only for its authorized selected project and the preset it would be created with.
    let skillScope: {snapshot?: types.agentPreset.Snapshot; workspace: {host: string; dir: string}} | undefined;
    if (workspace) skillScope = {snapshot, workspace: {host: workspace.workspaceHost ?? '', dir: workspace.workspaceDir}};
    else if (opts.projectId) {
        const project = await ctx.fns.projects.get({projectId: opts.projectId});
        if (project && project.dir.startsWith('/')) {
            const preset = await ctx.fns.agentPreset.resolve({id: opts.presetId}).catch(() => undefined);
            if (preset) skillScope = {snapshot: preset, workspace: {host: project.host, dir: project.dir}};
        }
    }
    const wantsSkills = !opts.name || opts.name.startsWith('skill.');
    const skills = wantsSkills && skillScope ? await ctx.fns.skills.commands({...skillScope, id: opts.name}) : [];
    // A chat frozen without the reader learns why, instead of an unknown-command error.
    if (opts.name?.startsWith('skill.') && !skills.length && skillScope?.snapshot && !ctx.fns.agentPreset.allows({snapshot: skillScope.snapshot, name: 'skills.read'})) {
        return [{command: {name: opts.name, kind: 'skill', label: opts.name, description: ''}, enabled: false, code: 'skills_unavailable',
            reason: 'This chat was created without skill access. Open a new chat to use skills.'}];
    }
    const registry = ctx.state.commands.registry ?? {};
    const external = !opts.name || /^(project|user):/.test(opts.name) ? await ctx.fns.commands.workspaceCommands({agent: workspace}) : [];
    const declarations = [...Object.values(registry).filter(command => !command.name?.startsWith('skill.')), ...external, ...skills];
    const allows = ctx.fns.agentPreset.predicate({snapshot});
    const visible = declarations.filter(command => !opts.name || command.name === opts.name).map(command => {
        if (!workspace && command.requiresSession) return {command, enabled: false, code: 'session_required', reason: 'Requires an existing session'};
        if (busy && command.blockWhileRunning) return {command, enabled: false, code: 'agent_running', reason: 'Stop the current or queued run first'};
        return {command, enabled: true};
    }).filter(({command}) => command.builtin || command.kind === 'skill' || !allows || ((!command.fn || allows(command.fn)) && (!command.available || allows(command.available))));
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
