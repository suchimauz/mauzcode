/**
 * Classify a runtime name using mounted plugin namespaces and loader provenance.
 * Project overrides of host namespaces retain core origin; unknown names are core.
 * @param opts.name Full dotted runtime function name, including nested namespaces.
 */
export default function (ctx: Context, _session: Session | null, opts: { name: string }): { kind: 'plugin'; plugin: string } | { kind: 'project' | 'core' } {
    const namespace = opts.name.split('.')[0]!;
    for (const plugin of ctx.fns.plugins.list({})) {
        if (plugin.namespaces.includes(namespace)) return { kind: 'plugin', plugin: plugin.name };
    }
    const sources = (ctx.state.procs.boot as any).namespaceSources as Record<string, { core: boolean; project: boolean }> | undefined;
    const source = sources?.[namespace];
    return { kind: source?.project && !source.core ? 'project' : 'core' };
}
