/** Seed missing shipped presets at boot after migrations; never overwrite a person's edits. */
export default async function (ctx: Context, _session: Session | null, _opts: {}): Promise<void> {
    for (const p of ctx.fns.agentPreset.defaults({})) {
        await ctx.fns.procs.db.run({
            sql: `INSERT INTO agent_presets (id, name, description, sort_order, builtin, allow, deny, plugins, exclude_sections, prompt, updated_at)
                VALUES (?, ?, ?, ?, true, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?) ON CONFLICT (id) DO NOTHING`,
            params: [p.id, p.name, p.description, p.sort_order, JSON.stringify(p.allow), JSON.stringify(p.deny), JSON.stringify(p.plugins), JSON.stringify(p.exclude_sections), p.prompt, Date.now()],
        });
    }
}
