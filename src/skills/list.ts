type SkillListResult = {
    /** Visible skills on this page: exact ID, short name, description and source label only. */
    skills: { id: string; name: string; description: string; source: string }[];
    /** Number of visible skills matching the query, across all pages. */
    total: number;
    /** Offset to pass for the next page; absent on the last page. */
    nextOffset?: number;
};
/**
 * List the Agent Skills this agent may use in its current project, by description.
 *
 * Returns only authorized IDs, names, sources and descriptions, never instructions or files. Use the exact id with read_skill / skills.read when a description fits the task. Results are filtered by the agent's own preset and workspace, never by arguments; hidden skills are simply absent.
 * @param opts.query Case-insensitive words matched against ID, name, description and source; omit to list all.
 * @param opts.offset Zero-based position in the filtered list. @default 0 @minimum 0
 * @param opts.limit Entries per page. @default 50 @minimum 1 @maximum 100
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Case-insensitive words matched against ID, name, description and source; omit to list all. */
        query?: string;
        /** Zero-based position in the filtered list. @default 0 @minimum 0 */
        offset?: number;
        /** Entries per page. @default 50 @minimum 1 @maximum 100 */
        limit?: number;
    } = {},
): Promise<SkillListResult> {
    const agent = session?.agent;
    if (!agent?.id) throw new Error('skills.list requires a trusted agent invocation');
    if (opts.query !== undefined && (typeof opts.query !== 'string' || opts.query.length > 200)) throw new Error('skills.list: query must be a string of at most 200 characters');
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 50;
    if (!Number.isInteger(offset) || offset < 0) throw new Error('skills.list: offset must be a non-negative integer');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('skills.list: limit must be an integer from 1 to 100');
    const policy = await ctx.fns.skills.policy({
        snapshot: agent.preset, reader: 'skills.list',
        workspace: { host: agent.workspaceHost ?? '', dir: agent.workspaceDir },
    });
    if (!policy.ok) throw new Error(policy.reason);
    const words = (opts.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const all = policy.entries.map(entry => ({
        id: entry.descriptor.id, name: entry.descriptor.name,
        description: entry.descriptor.description, source: entry.descriptor.sourceLabel,
    })).filter(skill => {
        const text = [skill.id, skill.name, skill.description, skill.source].join(' ').toLowerCase();
        return words.every(word => text.includes(word));
    });
    const skills = all.slice(offset, offset + limit);
    const next = offset + skills.length;
    return { skills, total: all.length, ...(next < all.length ? { nextOffset: next } : {}) };
}
