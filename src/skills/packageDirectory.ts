/**
 * Report the absolute directory on the workspace host where an authorized skill package can be used, including running its scripts.
 *
 * Workspace packages are used in place under their declared root. Other sources have no directory on the workspace host yet and return undefined. Performs no authorization: call skills.policy first.
 * @param opts.workspace Internal trusted workspace identity with its absolute directory and SSH alias (empty for local).
 * @param opts.id Exact canonical skill ID already authorized by skills.policy.
 * @param opts.revision Content revision computed by skills.read for this package.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Internal trusted workspace identity with its absolute directory and SSH alias (empty for local). */
        workspace: { host: string; dir: string };
        /** Exact canonical skill ID already authorized by skills.policy. */
        id: string;
        /** Content revision computed by skills.read for this package. */
        revision: string;
    },
): Promise<string | undefined> {
    const { posix } = await import('node:path');
    const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id: opts.id });
    if (!checked.ok || checked.id.sourceKind !== 'workspace') return undefined;
    const qualifier = checked.id.qualifier;
    const directory = qualifier === undefined ? '.mauzcode/skills'
        : (await ctx.fns.skills.workspaceConfig({ workspace: opts.workspace })).roots.find(root => root.name === qualifier)?.directory;
    return directory === undefined ? undefined : posix.join(opts.workspace.dir, directory, checked.id.name);
}
