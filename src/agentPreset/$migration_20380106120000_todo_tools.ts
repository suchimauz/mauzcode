/**
 * Rewrite plan tool and function grants to their todo names in user presets and agent preset snapshots.
 *
 * Renames exact rules in both `allow` and `deny`; a wildcard that covered an old name (`session.*`, `*`,
 * `tools.plan*`) gets the new name added next to it unless the list already covers it, so an allow keeps
 * access and a deny keeps blocking. Built-in factory presets are not stored (they derive from
 * `coreCatalogue`), so only stored rows and every snapshot layer are touched. Rewriting frozen snapshots
 * is a deliberate exception: without it existing agents would lose todo tracking. Unchanged lists are not
 * written and duplicates are not added, so a second run changes nothing.
 */
export default {
    up: async (ctx: Context) => {
        // Frozen mapping: independent of today's catalogue so reruns never follow future renames.
        const renames: Array<[string, string]> = [
            ['tools.planUpdate', 'tools.todoUpdate'],
            ['tools.planDone', 'tools.todoDone'],
            ['session.plan', 'todo.create'],
            ['session.updatePlan', 'todo.update'],
            ['session.done', 'todo.done'],
            ['session.removePlan', 'todo.remove'],
        ];
        const exact = new Map(renames);
        const glob = (pattern: string) => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
        const rewrite = (value: unknown): string[] | null => {
            if (!Array.isArray(value) || value.some(rule => typeof rule !== 'string')) return null;
            const rules = value as string[];
            const out: string[] = [];
            for (const rule of rules) {
                const next = exact.get(rule) ?? rule;
                if (!out.includes(next)) out.push(next);
            }
            for (const rule of [...out]) {
                // Wildcards are kept as is; every old function they covered gets its todo counterpart
                // unless another rule (for example `*`) already covers it.
                if (!rule.includes('*')) continue;
                for (const [from, to] of renames) if (glob(rule).test(from) && !out.some(item => glob(item).test(to))) out.push(to);
            }
            return JSON.stringify(out) === JSON.stringify(rules) ? null : out;
        };
        let presets = 0;
        let snapshots = 0;
        await ctx.fns.procs.db.transaction({ fn: async () => {
            await ctx.fns.procs.db.exec({ sql: 'LOCK TABLE agent_presets IN SHARE ROW EXCLUSIVE MODE' });
            const rows = await ctx.fns.procs.db.select({ sql: 'SELECT id, allow, deny FROM agent_presets ORDER BY id' }) as any[];
            for (const row of rows) {
                const allow = rewrite(row.allow);
                const deny = rewrite(row.deny);
                if (!allow && !deny) continue;
                await ctx.fns.procs.db.run({
                    sql: 'UPDATE agent_presets SET allow = ?::jsonb, deny = ?::jsonb WHERE id = ?',
                    params: [JSON.stringify(allow ?? row.allow), JSON.stringify(deny ?? row.deny), row.id],
                });
                presets++;
            }
            const agents = await ctx.fns.procs.db.select({ sql: 'SELECT id, preset_snapshot FROM agents WHERE preset_snapshot IS NOT NULL ORDER BY id FOR UPDATE' }) as any[];
            for (const row of agents) {
                const snapshot = typeof row.preset_snapshot === 'string' ? JSON.parse(row.preset_snapshot) : row.preset_snapshot;
                if (!snapshot || !Array.isArray(snapshot.layers)) continue;
                let changed = false;
                for (const layer of snapshot.layers) {
                    if (!layer || typeof layer !== 'object') continue;
                    const allow = rewrite(layer.allow);
                    const deny = rewrite(layer.deny);
                    if (allow) { layer.allow = allow; changed = true; }
                    if (deny) { layer.deny = deny; changed = true; }
                }
                if (!changed) continue;
                await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET preset_snapshot = ?::jsonb WHERE id = ?', params: [JSON.stringify(snapshot), row.id] });
                snapshots++;
            }
        } });
        // Report only counts, never preset rules or snapshot contents.
        ctx.fns.procs.log.info({ event: 'agentPreset.todo-tools', msg: `presets=${presets} snapshots=${snapshots}` });
        return { presets, snapshots };
    },
    // Intentionally no destructive down: rollback restores agent_presets and agents.preset_snapshot from backup.
};
