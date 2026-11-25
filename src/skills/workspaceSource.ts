type WorkspaceSourceResult =
    | { ok: true; action: 'scan'; packages: types.skills.PackageEntry[]; diagnostics: string[]; truncated: boolean }
    | types.skills.FilesResult;
/**
 * Scan the default and configured workspace skill roots, or access one exact workspace skill.
 *
 * Use the supplied trusted workspace identity, not the server cwd. Read the current on-host configuration for each call; failed roots do not hide independent sources. Only exact workspace IDs can address a package. This adapter reads inert data, not catalogue or preset grants.
 * @param opts.workspace Internal trusted workspace identity with its absolute directory and SSH alias (empty for local).
 * @param opts.action Scan all declared roots, list one package's resources, or read one bounded resource page. @default scan
 * @param opts.id Exact workspace skill ID for list or read; no short-name lookups or source substitution.
 * @param opts.path Package-relative file for the read action.
 * @param opts.offset Byte offset for the read action; use the preceding page's nextOffset to continue. @default 0 @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Internal trusted workspace identity with its absolute directory and SSH alias (empty for local). */
        workspace: { host: string; dir: string };
        /** Scan all declared roots, list one package's resources, or read one bounded resource page. @default scan */
        action?: 'scan' | 'list' | 'read';
        /** Exact workspace skill ID for list or read; no short-name lookups or source substitution. */
        id?: string;
        /** Package-relative file for the read action. */
        path?: string;
        /** Byte offset for the read action; use the preceding page's nextOffset to continue. @default 0 @minimum 0 */
        offset?: number;
    },
): Promise<WorkspaceSourceResult> {
    const action = opts.action ?? 'scan';
    const fail = (reason: string): WorkspaceSourceResult => ({ ok: false, reason });
    if (action !== 'scan' && action !== 'list' && action !== 'read') return fail('unknown workspace skill action');
    const { workspace } = opts;
    const defaultDir = '.mauzcode/skills';
    if (action !== 'scan') {
        const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id: opts.id });
        if (!checked.ok || checked.id.sourceKind !== 'workspace') return fail('expected an exact workspace skill ID');
        const { qualifier, name } = checked.id;
        const directory = qualifier === undefined ? defaultDir :
            (await ctx.fns.skills.workspaceConfig({ workspace })).roots.find(root => root.name === qualifier)?.directory;
        if (directory === undefined) return fail('workspace skill root is no longer declared');
        const result = await ctx.fns.skills.workspaceTransport({ workspace, directory, action, root: qualifier,
            packageName: name, path: opts.path, offset: opts.offset });
        return result.ok && result.action !== 'list' && result.action !== 'read' ? fail('invalid workspace reader response') : result;
    }
    const config = await ctx.fns.skills.workspaceConfig({ workspace });
    const roots: { name?: string; directory: string }[] = [{ directory: defaultDir }, ...config.roots];
    const limits = await ctx.fns.skills.packageLimits({});
    const packages: types.skills.PackageEntry[] = [];
    const diagnostics: string[] = [...config.diagnostics];
    let truncated = false;
    const note = (label: string, reason: string): void => {
        if (diagnostics.length < limits.diagnostics) diagnostics.push((label + ': ' + reason).slice(0, limits.diagnosticChars));
        else truncated = true;
    };
    // A few independent transports may run concurrently, but a bad project cannot fan out an unbounded number of reads.
    for (let start = 0; start < roots.length; start += 4) {
        const batch = roots.slice(start, start + 4);
        const results = await Promise.all(batch.map(root => ctx.fns.skills.workspaceTransport({
            workspace, action, root: root.name, directory: root.directory,
        })));
        for (const [i, result] of results.entries()) {
            const root = batch[i]!;
            const label = root.name === undefined ? 'default workspace root' : 'workspace root ' + root.name;
            if (!result.ok) { note(label, result.reason); continue; }
            if (result.action !== 'scan') { note(label, 'invalid workspace reader response'); continue; }
            packages.push(...result.packages);
            for (const reason of result.diagnostics) note(label, reason);
            truncated ||= result.truncated;
        }
    }
    return { ok: true, action, packages, diagnostics, truncated };
}
