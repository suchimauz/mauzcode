type GitPackageResult =
    | { ok: true; action: 'list'; packages: string[] }
    | { ok: true; action: 'read'; files: types.skills.StagedFile[] }
    | { ok: false; reason: string };
/**
 * List the skill packages of a fetched commit, or read one package's files, straight from Git objects.
 *
 * A package is a directory containing SKILL.md. Reads blobs with git cat-file, never checks out, so no filters, hooks or content run. Symbolic links and submodules are refused; the documented size and count limits apply.
 * @param opts.dir Bare repository created by skills.gitFetch.
 * @param opts.commit Fetched commit.
 * @param opts.action List package directories, or read one.
 * @param opts.package Package directory path inside the repository, e.g. skills/review, or . for the root; required by read.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Bare repository created by skills.gitFetch. */
        dir: string;
        /** Fetched commit. */
        commit: string;
        /** List package directories, or read one. */
        action: 'list' | 'read';
        /** Package directory path inside the repository, e.g. skills/review, or . for the root; required by read. */
        package?: string;
    },
): Promise<GitPackageResult> {
    const limits = await ctx.fns.skills.packageLimits({});
    const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: opts.dir + '/.home', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
    const git = (args: string[], binary = false) => {
        const out = Bun.spawnSync(['git', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: opts.dir, env, stdout: 'pipe', stderr: 'ignore', maxBuffer: 16 * 1024 * 1024 });
        return { code: out.exitCode, bytes: Buffer.from(out.stdout), text: binary ? '' : out.stdout.toString() };
    };
    if (!/^[0-9a-f]{40}$/.test(opts.commit)) return { ok: false, reason: 'invalid commit' };
    const tree = git(['ls-tree', '-r', '-l', '-z', opts.commit]);
    if (tree.code !== 0) return { ok: false, reason: 'cannot read the commit tree' };
    const entries = tree.text.split('\0').filter(Boolean).slice(0, 50_000).map(line => {
        const [meta, path] = line.split('\t') as [string, string];
        const [mode, type, oid, size] = meta.trim().split(/\s+/) as [string, string, string, string];
        return { mode, type, oid, size: Number(size), path };
    });
    if (opts.action === 'list') {
        const packages = entries.filter(e => e.type === 'blob' && (e.path === 'SKILL.md' || e.path.endsWith('/SKILL.md')))
            .map(e => (e.path === 'SKILL.md' ? '.' : e.path.slice(0, -'/SKILL.md'.length))).sort().slice(0, 200);
        return { ok: true, action: 'list', packages };
    }
    const pkg = opts.package ?? '';
    if (pkg !== '.' && (!pkg || pkg.split('/').some(part => !part || part === '.' || part === '..'))) return { ok: false, reason: 'invalid package path' };
    const prefix = pkg === '.' ? '' : pkg + '/';
    const inside = entries.filter(e => e.path.startsWith(prefix));
    if (!inside.some(e => e.path === prefix + 'SKILL.md')) return { ok: false, reason: 'no SKILL.md in ' + pkg };
    const files: types.skills.StagedFile[] = [];
    let total = 0;
    for (const entry of inside) {
        if (entry.type === 'commit') return { ok: false, reason: 'submodules are not imported: ' + entry.path };
        if (entry.mode === '120000') return { ok: false, reason: 'symbolic links are not imported: ' + entry.path };
        if (entry.type !== 'blob') continue;
        // A root package carries only its skill resources, not the rest of the repository.
        const rel = entry.path.slice(prefix.length);
        if (pkg === '.' && rel !== 'SKILL.md' && !/^(references|scripts|assets)\//.test(rel) && !/^LICENSE(\.md|\.txt)?$/.test(rel)) continue;
        if (files.length > limits.resources) return { ok: false, reason: 'the package has too many files' };
        total += entry.size;
        if (entry.size > limits.resourceBytes || total > limits.packageBytes) return { ok: false, reason: 'the package exceeds the size limits' };
        const blob = git(['cat-file', 'blob', entry.oid], true);
        if (blob.code !== 0 || blob.bytes.length !== entry.size) return { ok: false, reason: 'cannot read ' + rel };
        files.push({ path: rel, data: blob.bytes.toString('base64'), executable: entry.mode === '100755' });
    }
    return { ok: true, action: 'read', files };
}
