type ServerSourceResult =
    | { ok: true; action: 'scan'; packages: types.skills.PackageEntry[]; diagnostics: string[]; truncated: boolean }
    | types.skills.FilesResult;
/**
 * Scan the server skill library branches visible to one workspace, or access one exact server skill.
 *
 * Reads only global/ and projects/<project-id>/ for the current workspace identity from the installation-owned library on the MauzCode server, never from the workspace. Missing branches are empty; one failing branch does not hide the other. Only exact skill.server.global or skill.server.project IDs address a package. Inert data only: no grants, writes or execution.
 * @param opts.workspace Internal trusted workspace identity with its absolute directory and SSH alias (empty for local).
 * @param opts.action Scan both branches, list one package's resources, or read one bounded resource page. @default scan
 * @param opts.id Exact server skill ID for list or read; no short-name lookups or source substitution.
 * @param opts.path Package-relative file for the read action.
 * @param opts.offset Byte offset for the read action; use the preceding page's nextOffset to continue. @default 0 @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Internal trusted workspace identity with its absolute directory and SSH alias (empty for local). */
        workspace: { host: string; dir: string };
        /** Scan both branches, list one package's resources, or read one bounded resource page. @default scan */
        action?: 'scan' | 'list' | 'read';
        /** Exact server skill ID for list or read; no short-name lookups or source substitution. */
        id?: string;
        /** Package-relative file for the read action. */
        path?: string;
        /** Byte offset for the read action; use the preceding page's nextOffset to continue. @default 0 @minimum 0 */
        offset?: number;
    },
): Promise<ServerSourceResult> {
    const { lstatSync } = await import('node:fs');
    const action = opts.action ?? 'scan';
    const fail = (reason: string): ServerSourceResult => ({ ok: false, reason });
    if (action !== 'scan' && action !== 'list' && action !== 'read') return fail('unknown server skill action');
    const library = await ctx.fns.skills.serverLibrary({ workspace: opts.workspace });
    if (!library.ok) return fail(library.reason);
    /** A branch that was never created is empty, not broken; anything else must be a real directory. */
    const state = (dir: string): 'missing' | 'dir' | 'bad' => {
        try { return lstatSync(dir).isDirectory() ? 'dir' : 'bad'; }
        catch (error) { return (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'missing' : 'bad'; }
    };
    if (action !== 'scan') {
        const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id: opts.id });
        if (!checked.ok || (checked.id.sourceKind !== 'serverGlobal' && checked.id.sourceKind !== 'serverProject')) return fail('expected an exact server skill ID');
        const anchorDir = checked.id.sourceKind === 'serverGlobal' ? library.globalDir : library.projectDir;
        if (state(anchorDir) !== 'dir') return fail('server skill ' + checked.id.id + ' is not available');
        return ctx.fns.skills.packageFiles({ anchorDir, packageName: checked.id.name, action, path: opts.path, offset: opts.offset });
    }
    const limits = await ctx.fns.skills.packageLimits({});
    const packages: types.skills.PackageEntry[] = [];
    const diagnostics: string[] = [];
    let truncated = false;
    const note = (label: string, reason: string): void => {
        if (diagnostics.length < limits.diagnostics) diagnostics.push((label + ': ' + reason).slice(0, limits.diagnosticChars));
        else truncated = true;
    };
    const branches = [
        { label: 'server global library', anchorDir: library.globalDir, sourceKind: 'serverGlobal' as const },
        { label: 'server project library', anchorDir: library.projectDir, sourceKind: 'serverProject' as const },
    ];
    for (const branch of branches) {
        const kind = state(branch.anchorDir);
        if (kind === 'missing') continue;
        if (kind === 'bad') { note(branch.label, 'is not a readable directory'); continue; }
        const result = await ctx.fns.skills.packageScan({ anchorDir: branch.anchorDir, sourceKind: branch.sourceKind });
        if (!result.ok) { note(branch.label, result.reason); continue; }
        packages.push(...result.packages);
        for (const reason of result.diagnostics) note(branch.label, reason);
        truncated ||= result.truncated;
    }
    return { ok: true, action, packages, diagnostics, truncated };
}
