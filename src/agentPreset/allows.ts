/**
 * Resolve direct-call access by intersecting frozen snapshot layers against current origins.
 * Deny wins; plugin access comes only from plugin grants, project-only namespaces are
 * implicit grants, and core names require allow patterns. This is not a sandbox.
 * @param opts.snapshot Immutable creation-time rules, including all parent layers.
 * @param opts.name Full dotted runtime function name to check.
 */
export default function (ctx: Context, _session: Session | null, opts: { snapshot: types.agentPreset.Snapshot; name: string }): boolean {
    const boot = ctx.state.procs.boot as any;
    const cache: WeakMap<types.agentPreset.Snapshot, { layers: { allow: RegExp[]; deny: RegExp[]; plugins: string[] }[]; generation: number; decisions: Map<string, boolean> }> = (boot.presetAccessCache ??= new WeakMap());
    const generation = ctx.fns.agentPreset.generation({});
    let compiled = cache.get(opts.snapshot);
    if (!compiled) {
        compiled = {
            layers: opts.snapshot.layers.map(layer => ({
                allow: layer.allow.map(pattern => ctx.fns.agentPreset.compilePattern({ pattern })),
                deny: layer.deny.map(pattern => ctx.fns.agentPreset.compilePattern({ pattern })),
                plugins: [...layer.plugins],
            })),
            generation, decisions: new Map(),
        };
        cache.set(opts.snapshot, compiled);
    }
    if (compiled.generation !== generation) {
        compiled.generation = generation;
        compiled.decisions.clear();
    }
    const hit = compiled.decisions.get(opts.name);
    if (hit !== undefined) return hit;
    const origin = ctx.fns.agentPreset.origin({ name: opts.name });
    const allowed = compiled.layers.length > 0 && compiled.layers.every(layer => {
        if (layer.deny.some(pattern => pattern.test(opts.name))) return false;
        if (origin.kind === 'plugin') return layer.plugins.includes('*') || layer.plugins.includes(origin.plugin);
        if (origin.kind === 'project') return true;
        return layer.allow.some(pattern => pattern.test(opts.name));
    });
    compiled.decisions.set(opts.name, allowed);
    return allowed;
}
