/**
 * Reject unknown or malformed writable preset fields before any database write.
 * Storage identity and built-in status cannot be changed through a patch.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Complete creation definition or partial editable fields. */
    definition: types.agentPreset.Definition | Partial<Omit<types.agentPreset.Definition, 'id'>>;
    /** Validate a partial update instead of requiring id and name. @default false */
    patch?: boolean;
}): void {
    const value = opts.definition;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Preset definition must be an object');
    const fields = ['name', 'description', 'sort_order', 'allow', 'deny', 'plugins', 'exclude_sections', 'prompt'];
    if (!opts.patch) fields.push('id');
    for (const key of Object.keys(value)) if (!fields.includes(key)) throw new Error(`Unknown preset field: ${key}`);
    if (!opts.patch) {
        const id = (value as types.agentPreset.Definition).id;
        if (typeof id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Preset id must be nonempty kebab-case');
        if (!Object.hasOwn(value, 'name')) throw new Error('Preset name is required');
    }
    for (const key of ['name', 'description', 'prompt'] as const) {
        if (Object.hasOwn(value, key) && (typeof value[key] !== 'string' || (key === 'name' && !value[key]!.trim()))) throw new Error(`Preset ${key} must be ${key === 'name' ? 'a nonempty' : 'a'} string`);
    }
    if (Object.hasOwn(value, 'sort_order') && (!Number.isInteger(value.sort_order) || value.sort_order! < -2147483648 || value.sort_order! > 2147483647)) throw new Error('Preset sort_order must be a 32-bit integer');
    for (const key of ['allow', 'deny', 'plugins', 'exclude_sections'] as const) {
        if (!Object.hasOwn(value, key)) continue;
        const entries = value[key];
        if (!Array.isArray(entries) || entries.some(item => typeof item !== 'string')) throw new Error(`Preset ${key} must be a string array`);
        if (key === 'allow' || key === 'deny') for (const pattern of entries) ctx.fns.agentPreset.compilePattern({ pattern });
        if (key === 'plugins' && entries.some(item => item !== '*' && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(item))) throw new Error('Preset plugins must contain plugin identifiers or *');
    }
}
