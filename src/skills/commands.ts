/**
 * Derive Skills menu entries from the skills one reader may use in one project.
 *
 * Read-only bridge between skills.policy and the command catalogue: each visible skill becomes a `skill` kind entry named by its canonical ID, in the Skills section, with short name, source label and description. Never reads package bodies. Without a snapshot or reader grant returns no entries.
 * @param opts.snapshot Frozen preset snapshot of the existing chat, or the resolved preset of a new chat.
 * @param opts.workspace Trusted workspace of the existing chat, or of the authorized selected project.
 * @param opts.id Exact canonical ID to resolve alone, for dispatch; omit to list all.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Frozen preset snapshot of the existing chat, or the resolved preset of a new chat. */
        snapshot?: types.agentPreset.Snapshot;
        /** Trusted workspace of the existing chat, or of the authorized selected project. */
        workspace: { host: string; dir: string };
        /** Exact canonical ID to resolve alone, for dispatch; omit to list all. */
        id?: string;
    },
): Promise<(types.commands.Command & { name: string })[]> {
    if (!opts.snapshot || !ctx.fns.agentPreset.allows({ snapshot: opts.snapshot, name: 'skills.read' })) return [];
    let policy;
    try {
        policy = await ctx.fns.skills.policy({ snapshot: opts.snapshot, workspace: opts.workspace, reader: 'skills.read', id: opts.id });
    } catch {
        return [];
    }
    if (!policy.ok) return [];
    // Labels that would read identically get the root or plugin qualifier appended.
    const labels = new Map<string, number>();
    for (const { descriptor } of policy.entries) labels.set(descriptor.name + '\0' + descriptor.sourceLabel, (labels.get(descriptor.name + '\0' + descriptor.sourceLabel) ?? 0) + 1);
    return policy.entries.map(({ descriptor }) => {
        const clash = (labels.get(descriptor.name + '\0' + descriptor.sourceLabel) ?? 0) > 1 && descriptor.qualifier;
        const source = clash ? `${descriptor.sourceLabel} (${descriptor.qualifier})` : descriptor.sourceLabel;
        return {
            name: descriptor.id, kind: 'skill', label: descriptor.name, description: descriptor.description,
            icon: 'book', section: 'skills', order: 100, usage: ['/' + descriptor.id + ' <task>'], inputHint: 'task',
            skill: { id: descriptor.id, name: descriptor.name, source, sourceKind: descriptor.sourceKind, ...(descriptor.qualifier ? { qualifier: descriptor.qualifier } : {}) },
        };
    });
}
