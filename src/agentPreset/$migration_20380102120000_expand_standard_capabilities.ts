/** Upgrade only the untouched pre-expansion factory Standard; never touch agent snapshots. */
export default {
    up: async (ctx: Context) => {
        // Frozen historical baseline, deliberately independent of defaults/coreCatalogue.
        // JSONB containment in both directions ignores rule order (and redundant duplicates).
        const previousAllow = [
            'agent.respondHtml', 'agent.readResult', 'agent.compact', 'agent.delegate',
            'agent.team', 'agent.ask', 'agent.steer', 'agent.finishTask',
            'agent.archiveMember', 'agent.archiveCompleted', 'agent.unarchiveMember',
            'agent.search', 'agent.message', 'agent.current', 'agent.wake', 'agent.cron',
            'agent.watch', 'agent.triggers', 'agent.cancelTrigger', 'agent.cancelAllTriggers',
            'agentPreset.list', 'agentPreset.get', 'attachments.*', 'canvas.*',
            'code.callers', 'code.slice', 'code.quality', 'code.coverage', 'code.dead',
            'code.boundary', 'files.*', 'git.*', 'goal.tool*', 'input.*', 'markdown.*',
            'planning.*', 'plugins.search', 'plugins.read', 'plugins.functions',
            'remote.servers', 'remote.status', 'resultStore.*', 'runtime.docs.search',
            'runtime.docs.get', 'secrets.list', 'session.plan', 'session.done',
            'session.updatePlan', 'session.removePlan', 'session.get*', 'session.search*',
            'settings.get', 'settings.getString', 'settings.getNumber', 'settings.list',
            'sharedAgent.list', 'sharedAgent.delegate', 'sharedAgent.result',
            'tools.read', 'tools.write', 'tools.edit', 'tools.grep', 'tools.find',
            'tools.bash', 'tools.eval', 'workspace.*',
        ];
        // A single conditional UPDATE also protects edits concurrent with this migration.
        // Keep the target fixed too: rerunning historical migrations must not grant future defaults.
        await ctx.fns.procs.db.run({
            sql: `UPDATE agent_presets
                SET description = ?, allow = ?::jsonb, plugins = ?::jsonb, updated_at = ?
                WHERE id = 'standard' AND builtin = true AND name = 'Standard'
                    AND description = 'Code and task work without runtime management or plugin grants.'
                    AND sort_order = 10 AND prompt = ''
                    AND deny = '[]'::jsonb AND plugins = '[]'::jsonb AND exclude_sections = '[]'::jsonb
                    AND allow @> ?::jsonb AND allow <@ ?::jsonb`,
            params: [
                'Code and task work with specification, review, research and browser plugins; no runtime management.',
                JSON.stringify([...previousAllow, 'projects.list', 'projects.get']),
                JSON.stringify(['openspec', 'git', 'websearch', 'browser', 'gh', 'terminal', 'glab']),
                Date.now(), JSON.stringify(previousAllow), JSON.stringify(previousAllow),
            ],
        });
    },
    // Intentionally no destructive down: rollback must not erase opt-ins or later edits.
};
