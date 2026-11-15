/**
 * Return the current access-registry generation for memo and derived prompt/discovery keys.
 * Loader mutations advance it eagerly; namespace metadata changes are detected here too.
 * Use this value in any cache derived from preset access, never snapshot identity alone.
 */
export default function (ctx: Context, _session: Session | null, _opts: {}): number {
    const boot = ctx.state.procs.boot as any;
    const signature = JSON.stringify([
        ctx.fns.plugins.list({}).map(p => [p.name, [...p.namespaces].sort()]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        Object.entries(boot.namespaceSources ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ]);
    if (boot.presetOriginSignature !== signature) {
        boot.presetOriginSignature = signature;
        boot.registryGeneration = (boot.registryGeneration ?? 0) + 1;
    }
    return boot.registryGeneration ?? 0;
}
