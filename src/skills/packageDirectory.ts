type PackageDirectoryResult = { ok: true; directory: string } | { ok: false; reason: string };
/**
 * Report the absolute directory on the workspace host where an authorized skill package can be used, including running its scripts.
 *
 * Workspace packages are used in place under their declared root. Server and plugin packages are materialized by skills.materialize into the read-only revision cache ~/.cache/mauzcode/skills/<id>/<revision>/ on the workspace host. Performs no authorization: call skills.policy first.
 * @param opts.workspace Internal trusted workspace identity with its absolute directory and SSH alias (empty for local).
 * @param opts.id Exact canonical skill ID already authorized by skills.policy.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Internal trusted workspace identity with its absolute directory and SSH alias (empty for local). */
        workspace: { host: string; dir: string };
        /** Exact canonical skill ID already authorized by skills.policy. */
        id: string;
    },
): Promise<PackageDirectoryResult> {
    const { posix } = await import('node:path');
    const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id: opts.id });
    if (!checked.ok) return { ok: false, reason: checked.reason };
    if (checked.id.sourceKind !== 'workspace') {
        const copy = await ctx.fns.skills.materialize({ workspace: opts.workspace, id: opts.id });
        return copy.ok ? { ok: true, directory: copy.directory } : { ok: false, reason: copy.reason };
    }
    const qualifier = checked.id.qualifier;
    const directory = qualifier === undefined ? '.mauzcode/skills'
        : (await ctx.fns.skills.workspaceConfig({ workspace: opts.workspace })).roots.find(root => root.name === qualifier)?.directory;
    if (directory === undefined) return { ok: false, reason: 'workspace skill root is no longer declared' };
    return { ok: true, directory: posix.join(opts.workspace.dir, directory, checked.id.name) };
}
