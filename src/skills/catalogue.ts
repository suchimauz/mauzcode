type CatalogueEntry = {
    /** Public descriptor: canonical ID, short name, description and source label. */
    descriptor: types.skills.Descriptor;
    /** Parsed manifest from the bounded header only. */
    manifest: types.skills.Manifest;
    /** sha256 of the descriptor and parsed header; changes whenever the manifest or its origin changes. The full package revision is computed on read. */
    headerDigest: string;
    /** For plugin exports: whether the workspace lists this exact ID in enabledPluginSkills. Always true for other sources. */
    enabled: boolean;
};
type CatalogueResult = {
    /** Healthy packages from every source, sorted by canonical ID; ambiguous IDs are withheld. */
    entries: CatalogueEntry[];
    /** Bounded diagnostics, each prefixed with the source it concerns. */
    diagnostics: string[];
    /** True when a source or the diagnostics budget cut its listing short. */
    truncated: boolean;
};
/**
 * Merge the workspace, server-library and plugin skill sources into one catalogue keyed by canonical ID.
 *
 * Every call reads the current files, configuration and mounted plugin registry, so edits, reloads and workspace switches apply without a restart and no stale metadata is served. Matching short names in different origins coexist; one canonical ID claimed by two packages is withheld and diagnosed rather than resolved by scan order. An unreachable source contributes a diagnostic while the others stay usable. Metadata only: no instructions body, no grant decision.
 * @param opts.workspace Internal trusted workspace identity with its absolute directory and SSH alias (empty for local).
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Internal trusted workspace identity with its absolute directory and SSH alias (empty for local). */
        workspace: { host: string; dir: string };
    },
): Promise<CatalogueResult> {
    const limits = await ctx.fns.skills.packageLimits({});
    const diagnostics: string[] = [];
    let truncated = false;
    const note = (reason: string): void => {
        if (diagnostics.length < limits.diagnostics) diagnostics.push(reason.slice(0, limits.diagnosticChars));
        else truncated = true;
    };
    const settle = async <T>(label: string, run: () => Promise<T>): Promise<T | null> => {
        try { return await run(); }
        catch { note(label + ': source failed'); return null; }
    };
    const [workspace, server, plugin, config] = await Promise.all([
        settle('workspace', () => ctx.fns.skills.workspaceSource({ workspace: opts.workspace })),
        settle('server', () => ctx.fns.skills.serverSource({ workspace: opts.workspace })),
        settle('plugins', () => ctx.fns.skills.pluginSource({})),
        settle('workspace config', () => ctx.fns.skills.workspaceConfig({ workspace: opts.workspace })),
    ]);
    const enabled = new Set(config?.enabledPluginSkills ?? []);
    const found: { entry: types.skills.PackageEntry; label: string }[] = [];
    for (const [label, result] of [['workspace', workspace], ['server', server], ['plugins', plugin]] as const) {
        if (!result) continue;
        if (!result.ok) { note(label + ': ' + result.reason); continue; }
        if (result.action !== 'scan') { note(label + ': invalid source response'); continue; }
        for (const reason of result.diagnostics) note(reason);
        truncated ||= result.truncated;
        for (const entry of result.packages) found.push({ entry, label });
    }
    const byId = new Map<string, typeof found>();
    for (const item of found) {
        const list = byId.get(item.entry.descriptor.id) ?? [];
        list.push(item);
        byId.set(item.entry.descriptor.id, list);
    }
    const entries: CatalogueEntry[] = [];
    for (const [id, items] of [...byId.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        if (items.length > 1) { note(id + ': claimed by ' + items.length + ' packages; withheld until disambiguated'); continue; }
        const { entry } = items[0]!;
        entries.push({
            descriptor: entry.descriptor,
            manifest: entry.manifest,
            headerDigest: new Bun.CryptoHasher('sha256').update(JSON.stringify([entry.descriptor, entry.manifest, entry.headerBytes])).digest('hex'),
            enabled: entry.descriptor.sourceKind !== 'plugin' || enabled.has(id),
        });
    }
    return { entries, diagnostics, truncated };
}
