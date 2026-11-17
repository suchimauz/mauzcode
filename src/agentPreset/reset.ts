/** Return the current code-defined built-in without writes; compatibility reset leaves snapshots unchanged and rejects custom IDs. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Shipped built-in identifier: standard, creator or minimal. */
    id: string;
}): Promise<types.agentPreset.Preset> {
    const p = ctx.fns.agentPreset.defaults({}).find(preset => preset.id === opts.id);
    if (!p) throw new Error(`Cannot reset non-built-in preset: ${opts.id}`);
    return structuredClone(p);
}
