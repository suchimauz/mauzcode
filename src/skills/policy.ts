type PolicyEntry = {
    /** Public descriptor: canonical ID, short name, description and source label. */
    descriptor: types.skills.Descriptor;
    /** Parsed manifest from the bounded header only. */
    manifest: types.skills.Manifest;
    /** Digest of the descriptor and parsed header; changes with the manifest. */
    headerDigest: string;
};
type PolicyResult =
    | { ok: true; entries: PolicyEntry[]; truncated: boolean }
    | { ok: false; reason: string };
/**
 * Decide which skills one agent may discover and read right now.
 *
 * The single read policy shared by skills.list, skills.read, prompt discovery and slash dispatch. Reads the live catalogue for the agent's current workspace, then keeps an entry only when every frozen snapshot layer grants the reader function, and, for plugin exports, the plugin is mounted, the workspace enables that exact ID, and every layer grants the plugin. Omits everything else without revealing it. Never accepts client-supplied locations, grants or labels.
 * @param opts.snapshot Frozen creation-time preset snapshot of the calling agent, including parent layers.
 * @param opts.workspace Trusted workspace identity of the calling agent or authorized new-session project.
 * @param opts.reader Reader function that must be granted: skills.list for discovery, skills.read for reading. @default skills.read
 * @param opts.id Exact canonical ID to authorize alone; omit to list every visible skill.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Frozen creation-time preset snapshot of the calling agent, including parent layers. */
        snapshot?: types.agentPreset.Snapshot;
        /** Trusted workspace identity of the calling agent or authorized new-session project. */
        workspace: { host: string; dir: string };
        /** Reader function that must be granted: skills.list for discovery, skills.read for reading. @default skills.read */
        reader?: 'skills.list' | 'skills.read';
        /** Exact canonical ID to authorize alone; omit to list every visible skill. */
        id?: string;
    },
): Promise<PolicyResult> {
    const unavailable: PolicyResult = { ok: false, reason: 'skill is not available' };
    const snapshot = opts.snapshot;
    const reader = opts.reader ?? 'skills.read';
    if (reader !== 'skills.list' && reader !== 'skills.read') return { ok: false, reason: 'unknown skill reader' };
    if (!snapshot || !Array.isArray(snapshot.layers) || snapshot.layers.length === 0) return { ok: false, reason: 'skills require an agent preset that grants reading' };
    if (!ctx.fns.agentPreset.allows({ snapshot, name: reader })) return { ok: false, reason: 'skills are not available in preset ' + snapshot.name };
    if (opts.id !== undefined) {
        const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id: opts.id });
        if (!checked.ok) return { ok: false, reason: checked.reason };
    }
    const pluginGranted = (plugin: string): boolean => snapshot.layers.every(layer => layer.plugins.includes('*') || layer.plugins.includes(plugin));
    const catalogue = await ctx.fns.skills.catalogue({ workspace: opts.workspace });
    const entries: PolicyEntry[] = [];
    for (const entry of catalogue.entries) {
        if (opts.id !== undefined && entry.descriptor.id !== opts.id) continue;
        if (entry.descriptor.sourceKind === 'plugin' && (!entry.enabled || !pluginGranted(entry.descriptor.qualifier!))) continue;
        entries.push({ descriptor: entry.descriptor, manifest: entry.manifest, headerDigest: entry.headerDigest });
    }
    if (opts.id !== undefined && entries.length !== 1) return unavailable;
    return { ok: true, entries, truncated: catalogue.truncated };
}
