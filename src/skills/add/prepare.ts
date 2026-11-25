type PrepareResult =
    | { status: 'choose'; url: string; commit: string; packages: string[] }
    | { status: 'staged'; draftId: string; skillId: string; destination: string; digest: string; source: string; files: { path: string; bytes: number; executable: boolean; adapted: boolean }[]; next: string };
/**
 * Prepare one skill package for review without publishing it: draft it, copy a ready folder, or take one package from a public Git repository.
 *
 * Built-in Creator only. Validates the package, keeps source bytes, relative paths and license files unchanged, and applies only adaptations passed explicitly in adaptations (shown separately in the review). Git imports resolve the revision to an immutable commit and fetch it without credentials, hooks or submodules; with several packages and no package chosen the candidates are returned for the person to pick. The source folder or repository is never modified. Returns a draft to pass to skills.add.review.
 * @param opts.source Where the package comes from: draft (write a new one), folder (a ready package on the server or an SSH host) or git (a public HTTPS repository).
 * @param opts.destination Where it will be saved after approval: workspace (.mauzcode/skills of this project), serverProject (server library, this project) or serverGlobal (server library, every project).
 * @param opts.name Package name for a draft: lowercase letters, digits and single hyphens.
 * @param opts.description What the drafted skill does and when to use it.
 * @param opts.instructions Markdown instructions of the drafted skill.
 * @param opts.extraFiles Additional text files of a drafted skill, e.g. references/checklist.md.
 * @param opts.host SSH alias of the folder's host; omit or empty for the MauzCode server. Folder source only.
 * @param opts.path Absolute folder path of the ready package. Folder source only.
 * @param opts.url Public https URL of the Git repository. Git source only.
 * @param opts.revision Branch, tag or commit; omitted uses the remote HEAD. Git source only.
 * @param opts.package Package directory inside the repository, from the choose result. Git source only.
 * @param opts.adaptations Proposed replacements of existing text files, e.g. rewritten paths; shown as a diff and never applied silently.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Where the package comes from: draft, folder or git. */
        source: 'draft' | 'folder' | 'git';
        /** Where it will be saved after approval: workspace, serverProject or serverGlobal. */
        destination: 'workspace' | 'serverProject' | 'serverGlobal';
        /** Package name for a draft. */
        name?: string;
        /** What the drafted skill does and when to use it. */
        description?: string;
        /** Markdown instructions of the drafted skill. */
        instructions?: string;
        /** Additional text files of a drafted skill. */
        extraFiles?: { path: string; text: string }[];
        /** SSH alias of the folder's host; empty for the server. */
        host?: string;
        /** Absolute folder path of the ready package. */
        path?: string;
        /** Public https URL of the Git repository. */
        url?: string;
        /** Branch, tag or commit; omitted uses the remote HEAD. */
        revision?: string;
        /** Package directory inside the repository. */
        package?: string;
        /** Proposed replacements of existing text files. */
        adaptations?: { path: string; text: string }[];
    },
): Promise<PrepareResult> {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const agent = session?.agent;
    if (!agent?.id || !await ctx.fns.skills.isCreator({ agent })) throw new Error('Adding skills is available only to the built-in Creator');
    const allowed = ['source', 'destination', 'name', 'description', 'instructions', 'extraFiles', 'host', 'path', 'url', 'revision', 'package', 'adaptations'];
    const unknown = Object.keys(opts ?? {}).filter(key => !allowed.includes(key));
    if (unknown.length) throw new Error('skills.add.prepare: unknown argument ' + unknown.join(', '));
    if (!['workspace', 'serverProject', 'serverGlobal'].includes(opts.destination)) throw new Error('Choose a destination: workspace, serverProject or serverGlobal');
    const text = (value: string) => Buffer.from(value, 'utf8').toString('base64');
    let files: types.skills.StagedFile[];
    let source: string;
    if (opts.source === 'draft') {
        if (typeof opts.name !== 'string' || typeof opts.description !== 'string' || typeof opts.instructions !== 'string') throw new Error('A draft needs name, description and instructions');
        if (/[\r\n]/.test(opts.description)) throw new Error('The description must be one line');
        const yaml = (value: string) => JSON.stringify(value);
        files = [{ path: 'SKILL.md', data: text(`---\nname: ${opts.name}\ndescription: ${yaml(opts.description)}\n---\n\n${opts.instructions.trim()}\n`), executable: false },
            ...(opts.extraFiles ?? []).map(file => ({ path: file.path, data: text(file.text), executable: false }))];
        source = 'new draft';
    } else if (opts.source === 'folder') {
        const read = await ctx.fns.skills.folderFiles({ host: opts.host ?? '', path: String(opts.path ?? '') });
        if (!read.ok) throw new Error('Cannot read the folder: ' + read.reason);
        files = read.files;
        source = (opts.host ? opts.host + ':' : 'server:') + opts.path;
    } else if (opts.source === 'git') {
        let url: URL;
        try { url = new URL(String(opts.url ?? '')); } catch { throw new Error('Give a public https:// Git URL'); }
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Only public https:// URLs without credentials, query or fragment are supported');
        if (opts.revision !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(opts.revision)) throw new Error('Invalid revision');
        const address = await ctx.fns.skills.publicAddress({ host: url.hostname });
        if (!address.ok) throw new Error('Refusing ' + url.hostname + ': ' + address.reason);
        const dir = mkdtempSync(join(tmpdir(), 'mauzcode-skill-git-'));
        try {
            const fetched = await ctx.fns.skills.gitFetch({ url: url.href.replace(/\/$/, ''), address: address.address, revision: opts.revision, dir });
            if (!fetched.ok) throw new Error('Git import failed: ' + fetched.reason);
            if (!opts.package) {
                const listed = await ctx.fns.skills.gitPackage({ dir, commit: fetched.commit, action: 'list' });
                if (!listed.ok || listed.action !== 'list') throw new Error('Git import failed: ' + (listed.ok ? 'invalid listing' : listed.reason));
                if (listed.packages.length !== 1) return { status: 'choose', url: url.href, commit: fetched.commit, packages: listed.packages };
                opts.package = listed.packages[0];
            }
            const read = await ctx.fns.skills.gitPackage({ dir, commit: fetched.commit, action: 'read', package: opts.package });
            if (!read.ok || read.action !== 'read') throw new Error('Git import failed: ' + (read.ok ? 'invalid package' : read.reason));
            files = read.files;
            source = `${url.href} @ ${fetched.commit} (${opts.package})`;
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    } else throw new Error('Choose a source: draft, folder or git');

    const originals: Record<string, string> = {};
    for (const change of opts.adaptations ?? []) {
        const index = files.findIndex(file => file.path === change.path);
        if (index < 0 || typeof change.text !== 'string') throw new Error('An adaptation must replace an existing file: ' + String(change.path));
        let before: string;
        try { before = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(files[index]!.data, 'base64')); }
        catch { throw new Error('Only text files can be adapted: ' + change.path); }
        if (before === change.text) continue;
        originals[change.path] = before;
        files[index] = { ...files[index]!, data: text(change.text), adapted: true };
    }
    const staged = await ctx.fns.skills.stageFiles({ files });
    if (!staged.ok) throw new Error('The package is not valid: ' + staged.reason);
    if (opts.source === 'draft' && staged.name !== opts.name) throw new Error('The drafted name is not valid');
    const id = await ctx.fns.skills.qualifiedId({ sourceKind: opts.destination, name: staged.name });
    if (!id.ok) throw new Error(id.reason);
    const draft: types.skills.Draft = {
        id: crypto.randomUUID(), agentId: agent.id, workspace: { host: agent.workspaceHost ?? '', dir: agent.workspaceDir },
        destination: opts.destination, skillId: id.id.id, name: staged.name, digest: ctx.fns.skills.filesDigest({ files: staged.files }),
        source, files: staged.files, originals, expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    const saved = await ctx.fns.skills.drafts({ action: 'save', draft });
    if (!saved.ok) throw new Error('Cannot stage the draft: ' + saved.reason);
    return {
        status: 'staged', draftId: draft.id, skillId: draft.skillId, destination: draft.destination, digest: draft.digest, source,
        files: draft.files.map(file => ({ path: file.path, bytes: Buffer.from(file.data, 'base64').length, executable: file.executable, adapted: file.adapted === true })),
        next: 'Open the human review with skills.add.review({ draftId }); nothing is saved before the person approves it.',
    };
}
