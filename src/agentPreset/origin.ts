/**
 * Classify a runtime name using mounted plugin namespaces and loader provenance.
 * Project overrides of host namespaces retain core origin; unknown names are core.
 * @param opts.name Full dotted runtime function name, including nested namespaces.
 */
export default function (ctx: Context, _session: Session | null, opts: { name: string }): { kind: 'plugin'; plugin: string } | { kind: 'project' | 'core' | 'unavailable' } {
    const namespace = opts.name.split('.')[0]!;
    if (namespace === 'websearch') {
        const mounted = ctx.fns.procs.modules.list({}).find(module => module.plugin && module.name === 'websearch');
        if (ctx.fns.plugins.logicalFacade({ plugin: 'websearch' }).includes(opts.name)) return mounted ? { kind: 'plugin', plugin: 'websearch' } : { kind: 'unavailable' };
        if (mounted?.fns.includes(opts.name)) return { kind: 'plugin', plugin: 'websearch' };
        return { kind: 'core' };
    }
    for (const plugin of ctx.fns.plugins.list({})) {
        if (plugin.namespaces.includes(namespace)) return { kind: 'plugin', plugin: plugin.name };
    }
    const sources = (ctx.state.procs.boot as any).namespaceSources as Record<string, { core: boolean; project: boolean }> | undefined;
    const source = sources?.[namespace];
    return { kind: source?.project && !source.core ? 'project' : 'core' };
}
