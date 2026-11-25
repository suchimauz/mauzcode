type DraftResult = { ok: true; draft: types.skills.Draft } | { ok: false; reason: string };
/**
 * Store, load or delete one staged skill draft in the installation library's private .drafts directory.
 *
 * Drafts live on the MauzCode server outside every scanned skill root and runtime source tree, as owner-only files. Loading checks the stored digest against the files, so a modified draft is refused. Internal to Creator authoring; performs no authorization.
 * @param opts.action Save a new draft, load one by id, or delete one.
 * @param opts.draft Complete draft to save.
 * @param opts.id Draft id to load or delete.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Save a new draft, load one by id, or delete one. */
        action: 'save' | 'load' | 'delete';
        /** Complete draft to save. */
        draft?: types.skills.Draft;
        /** Draft id to load or delete. */
        id?: string;
    },
): Promise<DraftResult> {
    const { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, lstatSync } = await import('node:fs');
    const { join } = await import('node:path');
    const library = await ctx.fns.skills.serverLibrary({ workspace: { host: '', dir: '/' } });
    if (!library.ok) return { ok: false, reason: library.reason };
    const dir = join(library.dir, '.drafts');
    const id = opts.action === 'save' ? opts.draft?.id : opts.id;
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return { ok: false, reason: 'invalid draft id' };
    const file = join(dir, id + '.json');
    if (opts.action === 'delete') { rmSync(file, { force: true }); return { ok: false, reason: 'deleted' }; }
    if (opts.action === 'save') {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const temp = file + '.' + Bun.randomUUIDv7() + '.tmp';
        writeFileSync(temp, JSON.stringify(opts.draft), { mode: 0o600, flag: 'wx' });
        renameSync(temp, file);
        return { ok: true, draft: opts.draft! };
    }
    try {
        if (!lstatSync(file).isFile() || lstatSync(file).size > 64 * 1024 * 1024) return { ok: false, reason: 'draft unavailable' };
        const draft = JSON.parse(readFileSync(file, 'utf8')) as types.skills.Draft;
        if (draft.id !== id || ctx.fns.skills.filesDigest({ files: draft.files }) !== draft.digest) return { ok: false, reason: 'draft integrity check failed' };
        return { ok: true, draft };
    } catch {
        return { ok: false, reason: 'draft unavailable' };
    }
}
