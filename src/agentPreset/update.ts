/** Update only supplied writable custom preset fields; existing agent snapshots remain unchanged. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Existing custom preset identifier, which cannot be renamed. */
    id: string;
    /** Editable fields only; id, builtin and updated_at are not accepted. */
    patch: Partial<Omit<types.agentPreset.Definition, 'id'>>;
}): Promise<types.agentPreset.Preset> {
    if (ctx.fns.agentPreset.defaults({}).some(preset => preset.id === opts.id)) throw new Error(`Cannot update built-in preset: ${opts.id}. Create or edit a custom copy with a distinct identifier instead.`);
    ctx.fns.agentPreset.validateDefinition({ definition: opts.patch, patch: true });
    const jsonFields = ['allow', 'deny', 'plugins', 'exclude_sections'];
    const entries = Object.entries(opts.patch);
    const assignments = entries.map(([key]) => `${key} = ?${jsonFields.includes(key) ? '::jsonb' : ''}`);
    const params = entries.map(([key, value]) => jsonFields.includes(key) ? JSON.stringify(value) : value);
    assignments.push('updated_at = ?');
    const rows = await ctx.fns.procs.db.select({ sql: `UPDATE agent_presets SET ${assignments.join(', ')} WHERE id = ? AND builtin = false RETURNING *`, params: [...params, Date.now(), opts.id] });
    if (!rows[0]) throw new Error(`Unknown agent preset: ${opts.id}`);
    return rows[0];
}
