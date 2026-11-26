/**
 * Apply the owner's stored model disables to a connection catalogue with the group availability rule
 *
 * The single availability rule shared by models.listModels (picker, Settings, list_models, inference), models.inference.assertModelEnabled, model availability edits, legacy conversion and native search. Pure and network-free. Without `groupLevel` the stored set is returned unchanged (per-member variant disables keep filtering levels). With `groupLevel` (providers declaring `capabilities.groupAvailability`, e.g. Antigravity) availability applies to each variant group as a whole: a group is off when its own id is stored or every one of its members is stored (an unconverted legacy disable); then the group id and all its member ids are off. Otherwise the group and every member are on, so legacy member flags no longer remove levels. Groups are taken only from validated `reasoning.variants` of the given catalogue (a trustworthy mapping, e.g. models.listModels output); ids not proven to be members are left as stored, never grouped by name. Returns the effective disabled ids sorted plus, per group id, its proven member ids and whether the group is off.
 * @param opts.models Validated catalogue of the connection (models.listModels output or sanitized cache).
 * @param opts.disabled Stored disabled model ids of the connection.
 * @param opts.groupLevel True when the provider declares group-level availability.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Validated catalogue of the connection (models.listModels output or sanitized cache). */
        models: types.models.ModelInfo[];
        /** Stored disabled model ids of the connection. */
        disabled: readonly string[];
        /** True when the provider declares group-level availability (`capabilities.groupAvailability`). */
        groupLevel?: boolean;
    },
): { off: string[]; groups: Record<string, { members: string[]; off: boolean }> } {
    const stored = new Set((Array.isArray(opts.disabled) ? opts.disabled : []).filter((id): id is string => typeof id === "string"));
    const groups: Record<string, { members: string[]; off: boolean }> = {};
    for (const m of Array.isArray(opts.models) ? opts.models : []) {
        const members = m?.reasoning?.variants?.members;
        if (!m || typeof m.id !== "string" || !Array.isArray(members) || !members.length) continue;
        const ids = members.map(x => x?.id).filter((id): id is string => typeof id === "string" && !!id);
        if (ids.length !== members.length) continue;
        groups[m.id] = { members: ids, off: stored.has(m.id) || ids.every(id => stored.has(id)) };
    }
    if (!opts.groupLevel) return { off: [...stored].sort(), groups };
    const off = new Set(stored);
    for (const [id, g] of Object.entries(groups)) {
        for (const member of g.members) off.delete(member);
        if (g.off) for (const x of [id, ...g.members]) off.add(x);
        else off.delete(id);
    }
    return { off: [...off].sort(), groups };
}
