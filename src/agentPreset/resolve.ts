/** Resolve current code-defined built-in or stored custom rules into an independent creation snapshot; a child can only narrow its parent. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Explicit preset identifier; omitted uses the parent or configured default. */
    id?: string;
    /** Parent snapshot to copy or intersect by appending the selected preset layer. */
    parent?: types.agentPreset.Snapshot;
}): Promise<types.agentPreset.Snapshot> {
    if (opts.id === undefined && opts.parent) return structuredClone(opts.parent);
    const id = opts.id ?? await ctx.fns.settings.getString({ module: 'agentPreset', scopeType: 'global', key: 'default', fallback: 'standard' });
    const preset = await ctx.fns.agentPreset.get({ id: id! });
    if (!preset) throw new Error(`Unknown agent preset: ${id}`);
    return structuredClone({
        presetId: preset.id,
        name: preset.name,
        layers: [...(opts.parent?.layers ?? []), { id: preset.id, allow: preset.allow, deny: preset.deny,
            plugins: preset.plugins, excludeSections: preset.exclude_sections, prompt: preset.prompt }],
    });
}
