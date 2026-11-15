/** Update only supplied writable preset fields; existing agent snapshots remain unchanged. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Existing preset identifier, which cannot be renamed. */
    id: string;
    /** Editable fields only; id, builtin and updated_at are not accepted. */
    patch: Partial<Omit<types.agentPreset.Definition, 'id'>>;
}): Promise<types.agentPreset.Preset> {
    ctx.fns.agentPreset.validateDefinition({ definition: opts.patch, patch: true });
    const jsonFields = ['allow', 'deny', 'plugins', 'exclude_sections'];
    const entries = Object.entries(opts.patch);
    const assignments = entries.map(([key]) => `${key} = ?${jsonFields.includes(key) ? '::jsonb' : ''}`);
    const params = entries.map(([key, value]) => jsonFields.includes(key) ? JSON.stringify(value) : value);
    assignments.push('updated_at = ?');
    const rows = await ctx.fns.procs.db.select({ sql: `UPDATE agent_presets SET ${assignments.join(', ')} WHERE id = ? RETURNING *`, params: [...params, Date.now(), opts.id] });
    if (!rows[0]) throw new Error(`Unknown agent preset: ${opts.id}`);
    return rows[0];
}
