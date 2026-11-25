type MaterializeResult = { ok: true; directory: string; revision: string; created: boolean } | { ok: false; reason: string };
/**
 * Copy one authorized server or plugin skill package to a read-only, revision-addressed cache on the workspace host.
 *
 * Reads every package file through the bounded source adapter, digests the exact bytes into a revision and writes them under ~/.cache/mauzcode/skills/<id>/<revision>/ on the workspace host (local, or SSH through a fixed Python program), keeping relative paths and executable bits. Files are staged in a private temporary sibling and renamed into place, so concurrent readers never see a partial copy; an existing revision is reused. Never writes into the workspace repository and never executes package content. Performs no authorization: call skills.policy first.
 * @param opts.workspace Internal trusted workspace identity with its absolute directory and SSH alias (empty for local).
 * @param opts.id Exact canonical server or plugin skill ID already authorized by skills.policy.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Internal trusted workspace identity with its absolute directory and SSH alias (empty for local). */
        workspace: { host: string; dir: string };
        /** Exact canonical server or plugin skill ID already authorized by skills.policy. */
        id: string;
    },
): Promise<MaterializeResult> {
    const fail = (reason: string): MaterializeResult => ({ ok: false, reason });
    const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id: opts.id });
    if (!checked.ok || checked.id.sourceKind === 'workspace') return fail('only server and plugin skills are materialized');
    const { workspace, id } = opts;
    const limits = await ctx.fns.skills.packageLimits({});
    const listing = await ctx.fns.skills.source({ workspace, id, action: 'list' });
    if (!listing.ok || listing.action !== 'list') return fail(listing.ok ? 'invalid listing' : listing.reason);
    if (listing.truncated || listing.packageBytes === undefined) return fail('package could not be fully listed within the documented limits');
    const files: { path: string; data: Buffer; executable: boolean }[] = [];
    for (const resource of [{ path: 'SKILL.md', bytes: listing.manifestBytes, executable: false }, ...listing.resources]) {
        const chunks: Buffer[] = [];
        let offset = 0;
        for (;;) {
            const page = await ctx.fns.skills.source({ workspace, id, action: 'read', path: resource.path, offset });
            if (!page.ok || page.action !== 'read') return fail(resource.path + ': ' + (page.ok ? 'invalid page' : page.reason));
            chunks.push(page.bytes);
            offset = page.nextOffset;
            if (!page.hasMore) break;
            if (chunks.length > Math.ceil(limits.resourceBytes / limits.pageBytes) + 1) return fail(resource.path + ': too many pages');
        }
        files.push({ path: resource.path, data: Buffer.concat(chunks), executable: resource.executable === true });
    }
    const hash = new Bun.CryptoHasher('sha256');
    for (const file of files) hash.update(JSON.stringify([file.path, file.executable, file.data.length])).update(file.data);
    const revision = hash.digest('hex').slice(0, 32);
    const payload = { id, revision, files: files.map(file => ({ path: file.path, executable: file.executable, data: file.data.toString('base64') })) };

    if (!workspace.host) {
        const { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } = await import('node:fs');
        const { homedir } = await import('node:os');
        const { dirname, join } = await import('node:path');
        const home = String(ctx.env.HOME ?? '').trim() || homedir();
        const parent = join(home, '.cache', 'mauzcode', 'skills', id);
        const target = join(parent, revision);
        try { if (statSync(target).isDirectory()) return { ok: true, directory: target, revision, created: false }; } catch {}
        let staging = '';
        const unlock = (path: string): void => {
            try { chmodSync(path, 0o700); } catch {}
        };
        try {
            mkdirSync(parent, { recursive: true, mode: 0o700 });
            staging = mkdtempSync(join(parent, '.staging-'));
            for (const file of files) {
                const path = join(staging, file.path);
                mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
                writeFileSync(path, file.data, { mode: 0o600, flag: 'wx' });
                chmodSync(path, file.executable ? 0o555 : 0o444);
            }
            const dirs = new Set<string>();
            for (const file of files) for (let dir = dirname(join(staging, file.path)); dir !== staging; dir = dirname(dir)) dirs.add(dir);
            for (const dir of [...dirs].sort((a, b) => b.length - a.length)) chmodSync(dir, 0o555);
            chmodSync(staging, 0o555);
            try {
                renameSync(staging, target);
                staging = '';
                return { ok: true, directory: target, revision, created: true };
            } catch {
                // A concurrent reader published the same revision first; its bytes are identical by digest.
                if (statSync(target).isDirectory()) return { ok: true, directory: target, revision, created: false };
                throw new Error('rename failed');
            }
        } catch {
            return fail('cannot write the skill cache on the workspace host');
        } finally {
            if (staging) {
                // Read-only staging directories must become writable again before they can be removed.
                const walk = (path: string): void => {
                    unlock(path);
                    try {
                        for (const name of readdirSync(path)) {
                            const child = join(path, name);
                            if (lstatSync(child).isDirectory()) walk(child);
                        }
                    } catch {}
                };
                walk(staging);
                rmSync(staging, { recursive: true, force: true });
            }
        }
    }

    // Fixed program: paths and bytes travel as JSON on stdin; package content is only written, never run.
    const program = String.raw`
    import base64, json, os, shutil, stat, sys, tempfile
    a = json.load(sys.stdin)
    parent = os.path.join(os.path.expanduser('~'), '.cache', 'mauzcode', 'skills', a['id'])
    target = os.path.join(parent, a['revision'])
    def done(created): print(json.dumps(dict(directory=target, created=created)), flush=True)
    if os.path.isdir(target) and not os.path.islink(target):
        done(False); sys.exit(0)
    os.makedirs(parent, mode=0o700, exist_ok=True)
    staging = tempfile.mkdtemp(prefix='.staging-', dir=parent)
    try:
        dirs = set()
        for f in a['files']:
            parts = f['path'].split('/')
            if any(p in ('', '.', '..') for p in parts): raise SystemExit(3)
            path = os.path.join(staging, *parts)
            d = os.path.dirname(path)
            os.makedirs(d, mode=0o700, exist_ok=True)
            while d != staging: dirs.add(d); d = os.path.dirname(d)
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as out: out.write(base64.b64decode(f['data']))
            os.chmod(path, 0o555 if f['executable'] else 0o444)
        for d in sorted(dirs, key=len, reverse=True): os.chmod(d, 0o555)
        os.chmod(staging, 0o555)
        try:
            os.rename(staging, target); staging = None; done(True)
        except OSError:
            if os.path.isdir(target): done(False)
            else: raise
    finally:
        if staging:
            for root, ds, fs in os.walk(staging):
                os.chmod(root, 0o700)
                for d in ds: os.chmod(os.path.join(root, d), 0o700)
            shutil.rmtree(staging, ignore_errors=True)
    `.replace(/^    /gm, '');
    try {
        const reply = await ctx.fns.remote.exec({
            host: workspace.host, command: 'exec python3 -I -B -S -c ' + ctx.fns.remote.quote({ value: program }),
            stdin: JSON.stringify(payload), timeout: 30, maxOutput: 8_192,
        });
        if (reply.timedOut) return fail('writing the skill cache on the SSH host timed out');
        if (reply.exitCode === 127) return fail('SSH skill cache requires Python 3 on the workspace host');
        if (reply.exitCode !== 0) return fail('cannot write the skill cache on the SSH host');
        const result = JSON.parse(reply.stdout) as { directory?: unknown; created?: unknown };
        if (typeof result.directory !== 'string' || !result.directory.startsWith('/') || !result.directory.endsWith('/' + revision)) return fail('invalid SSH skill cache response');
        return { ok: true, directory: result.directory, revision, created: result.created === true };
    } catch {
        return fail('cannot write the skill cache on the SSH host');
    }
}
