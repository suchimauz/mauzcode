/**
 * Route one exact skill ID to the source adapter that owns it and list or read one bounded page.
 *
 * Internal dispatcher behind skills.read: performs no authorization, so call skills.policy first. Workspace IDs read the workspace host, server IDs the installation library, plugin IDs the mounted export.
 * @param opts.workspace Internal trusted workspace identity with its absolute directory and SSH alias (empty for local).
 * @param opts.id Exact canonical skill ID already authorized by skills.policy.
 * @param opts.action List the package's resources, or read one bounded page of one file.
 * @param opts.path Package-relative file for the read action.
 * @param opts.offset Byte offset for the read action. @default 0 @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Internal trusted workspace identity with its absolute directory and SSH alias (empty for local). */
        workspace: { host: string; dir: string };
        /** Exact canonical skill ID already authorized by skills.policy. */
        id: string;
        /** List the package's resources, or read one bounded page of one file. */
        action: 'list' | 'read';
        /** Package-relative file for the read action. */
        path?: string;
        /** Byte offset for the read action. @default 0 @minimum 0 */
        offset?: number;
    },
): Promise<types.skills.FilesResult> {
    const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id: opts.id });
    if (!checked.ok) return { ok: false, reason: checked.reason };
    const { workspace, id, action, path, offset } = opts;
    const kind = checked.id.sourceKind;
    const result = kind === 'workspace' ? await ctx.fns.skills.workspaceSource({ workspace, id, action, path, offset })
        : kind === 'plugin' ? await ctx.fns.skills.pluginSource({ id, action, path, offset })
        : await ctx.fns.skills.serverSource({ workspace, id, action, path, offset });
    if (result.ok && result.action === 'scan') return { ok: false, reason: 'invalid skill source response' };
    return result as types.skills.FilesResult;
}
