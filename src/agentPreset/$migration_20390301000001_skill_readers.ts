/**
 * Add the two Agent Skills readers to an untouched factory Standard; never touch agent snapshots.
 *
 * New Standard agents may discover and read project skills (skills.list, skills.read). Only the exact previous
 * factory definition is upgraded, so customized rows and every existing agent snapshot keep their rules.
 */
export default {
    up: async (ctx: Context) => {
        // Frozen historical baseline: the Standard shipped with list_models. Independent of defaults/coreCatalogue.
        const previousAllow = [
            'agent.respondHtml', 'agent.readResult', 'agent.compact', 'agent.delegate',
            'agent.team', 'agent.ask', 'agent.steer', 'agent.finishTask',
            'agent.archiveMember', 'agent.archiveCompleted', 'agent.unarchiveMember',
            'agent.search', 'agent.message', 'agent.current', 'agent.wake', 'agent.cron',
            'agent.watch', 'agent.triggers', 'agent.cancelTrigger', 'agent.cancelAllTriggers', 'agent.applyTriggerAction',
            'agentPreset.list', 'agentPreset.get', 'attachments.*', 'canvas.*',
            'code.callers', 'code.slice', 'code.quality', 'code.coverage', 'code.dead',
            'code.boundary', 'files.*', 'git.*', 'goal.tool*', 'input.*', 'markdown.*',
            'planning.*', 'plugins.search', 'plugins.read', 'plugins.functions',
            'projects.list', 'projects.get',
            'remote.servers', 'remote.status', 'resultStore.*', 'runtime.docs.search',
            'runtime.docs.get', 'secrets.list', 'todo.create', 'todo.update',
            'todo.done', 'todo.remove', 'session.get*', 'session.search*',
            'settings.get', 'settings.getString', 'settings.getNumber', 'settings.list',
            'sharedAgent.list', 'sharedAgent.delegate', 'sharedAgent.result',
            'tools.read', 'tools.write', 'tools.edit', 'tools.grep', 'tools.find',
            'tools.bash', 'tools.eval', 'workspace.*',
            'tools.toolSearch', 'tools.toolDescribe', 'tools.readResult', 'tools.requestInput',
            'tools.todoUpdate', 'tools.todoDone', 'tools.delegateTask', 'tools.finishTask',
            'tools.showArtifact', 'models.selectable', 'tools.listModels',
        ];
        const added = ['skills.list', 'skills.read'];
        await ctx.fns.procs.db.run({
            sql: `UPDATE agent_presets
                SET allow = ?::jsonb, updated_at = ?
                WHERE id = 'standard' AND builtin = true AND name = 'Standard'
                    AND description = 'Code and task work with specification, review, research and browser plugins; no runtime management.'
                    AND sort_order = 10 AND prompt = ''
                    AND deny = '[]'::jsonb AND exclude_sections = '[]'::jsonb
                    AND plugins @> ?::jsonb AND plugins <@ ?::jsonb
                    AND allow @> ?::jsonb AND allow <@ ?::jsonb`,
            params: [
                JSON.stringify([...previousAllow, ...added]), Date.now(),
                JSON.stringify(['openspec', 'git', 'websearch', 'browser', 'gh', 'terminal', 'glab']),
                JSON.stringify(['openspec', 'git', 'websearch', 'browser', 'gh', 'terminal', 'glab']),
                JSON.stringify(previousAllow), JSON.stringify(previousAllow),
            ],
        });
    },
    // Intentionally no destructive down: rollback must not erase later edits.
};
