type FolderFilesResult = { ok: true; files: types.skills.StagedFile[] } | { ok: false; reason: string };
/**
 * Read every file of one ready skill package folder on the server or on an SSH workspace host, without modifying it.
 *
 * The folder is opened through the bounded package reader (local) or a fixed read-only Python program over SSH, refusing links, special files and oversized packages. The source folder is never written.
 * @param opts.host SSH alias of the host holding the folder; empty for the MauzCode server.
 * @param opts.path Absolute path of the package folder.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** SSH alias of the host holding the folder; empty for the MauzCode server. */
        host: string;
        /** Absolute path of the package folder. */
        path: string;
    },
): Promise<FolderFilesResult> {
    const { posix } = await import('node:path');
    const limits = await ctx.fns.skills.packageLimits({});
    const fail = (reason: string): FolderFilesResult => ({ ok: false, reason });
    const path = opts.path;
    if (typeof path !== 'string' || !path.startsWith('/') || path === '/' || path.endsWith('/') || path.split('/').slice(1).some(p => !p || p === '.' || p === '..') || /[\u0000-\u001f]/.test(path)) return fail('the folder must be a normalized absolute path');
    const anchorDir = posix.dirname(path);
    const packageName = posix.basename(path);
    if (!opts.host) {
        const listing = await ctx.fns.skills.packageFiles({ anchorDir, packageName, action: 'list' });
        if (!listing.ok || listing.action !== 'list') return fail(listing.ok ? 'invalid listing' : listing.reason);
        if (listing.truncated || listing.packageBytes === undefined || listing.skipped > 0) return fail('the folder contains links, special files or more than the documented limits');
        const files: types.skills.StagedFile[] = [];
        for (const entry of [{ path: 'SKILL.md', bytes: listing.manifestBytes, executable: false }, ...listing.resources]) {
            const chunks: Buffer[] = [];
            for (let offset = 0; ;) {
                const page = await ctx.fns.skills.packageFiles({ anchorDir, packageName, action: 'read', path: entry.path, offset });
                if (!page.ok || page.action !== 'read') return fail(entry.path + ': ' + (page.ok ? 'invalid page' : page.reason));
                chunks.push(page.bytes);
                offset = page.nextOffset;
                if (!page.hasMore) break;
            }
            files.push({ path: entry.path, data: Buffer.concat(chunks).toString('base64'), executable: entry.executable === true });
        }
        return { ok: true, files };
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._@-]*$/.test(opts.host)) return fail('invalid SSH host');
    const program = String.raw`
    import base64, json, os, stat, sys
    a = json.load(sys.stdin); l = a['limits']
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    files, total = [], 0
    def walk(fd, base, depth):
        global total
        for name in sorted(os.listdir(fd)):
            st = os.stat(name, dir_fd=fd, follow_symlinks=False)
            rel = base + name
            if stat.S_ISLNK(st.st_mode) or not (stat.S_ISREG(st.st_mode) or stat.S_ISDIR(st.st_mode)): raise SystemExit('links and special files are not imported: ' + rel)
            if name.startswith('.'): raise SystemExit('hidden entries are not imported: ' + rel)
            if stat.S_ISDIR(st.st_mode):
                if depth >= l['depth']: raise SystemExit('the folder nests too deeply')
                sub = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                try: walk(sub, rel + '/', depth + 1)
                finally: os.close(sub)
                continue
            total += st.st_size
            if len(files) > l['resources'] or st.st_size > (l['instructionsBytes'] if rel == 'SKILL.md' else l['resourceBytes']) or total > l['packageBytes']: raise SystemExit('the folder exceeds the documented limits')
            f = os.open(name, flags, dir_fd=fd)
            try: data = os.read(f, st.st_size + 1)
            finally: os.close(f)
            if len(data) != st.st_size: raise SystemExit('a file changed while being read: ' + rel)
            files.append(dict(path=rel, data=base64.b64encode(data).decode(), executable=bool(st.st_mode & 0o111)))
    root = os.open(a['path'], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: walk(root, '', 0)
    finally: os.close(root)
    print(json.dumps(dict(files=files)))
    `.replace(/^    /gm, '');
    try {
        const reply = await ctx.fns.remote.exec({ host: opts.host, command: 'exec python3 -I -B -S -c ' + ctx.fns.remote.quote({ value: program }), stdin: JSON.stringify({ path, limits }), timeout: 30, maxOutput: Math.ceil(limits.packageBytes * 1.4) + 65_536 });
        if (reply.timedOut) return fail('reading the SSH folder timed out');
        if (reply.exitCode !== 0) return fail((reply.stderr.trim().split('\n').pop() || 'cannot read the SSH folder').slice(0, limits.diagnosticChars));
        const parsed = JSON.parse(reply.stdout) as { files?: types.skills.StagedFile[] };
        if (!Array.isArray(parsed.files)) return fail('invalid SSH folder response');
        return { ok: true, files: parsed.files.map(f => ({ path: String(f.path), data: String(f.data), executable: f.executable === true })) };
    } catch {
        return fail('cannot read the SSH folder');
    }
}
