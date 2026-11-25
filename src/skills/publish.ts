type PublishResult = { ok: true; directory: string } | { ok: false; reason: string; conflict?: boolean };
/**
 * Publish a reviewed draft into its destination atomically and without replacing anything.
 *
 * Writes the files into a hidden staging directory next to the destination (ignored by discovery), then moves it into place with a no-replace rename (renameat2 RENAME_NOREPLACE), so readers see either nothing or the complete package and an existing ID is never overwritten. Server and local workspace destinations are written on this host; SSH workspace destinations through a fixed Python program on the workspace host. A new server project branch also gets project.json with its host and path. Performs no authorization: the review route checks the approval first.
 * @param opts.draft Approved draft whose digest was confirmed.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Approved draft whose digest was confirmed. */
        draft: types.skills.Draft;
    },
): Promise<PublishResult> {
    const { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, lstatSync } = await import('node:fs');
    const { dirname, join, posix } = await import('node:path');
    const { draft } = opts;
    const files = draft.files.map(file => ({ path: file.path, data: file.data, executable: file.executable }));
    if (draft.destination === 'workspace' && draft.workspace.host) {
        const anchor = posix.join(draft.workspace.dir, '.mauzcode', 'skills');
        const program = String.raw`
        import base64, ctypes, json, os, shutil, sys, uuid
        a = json.load(sys.stdin)
        anchor, name = a['anchor'], a['name']
        target = os.path.join(anchor, name)
        if os.path.lexists(target): print(json.dumps(dict(conflict=True))); sys.exit(0)
        os.makedirs(anchor, mode=0o755, exist_ok=True)
        staging = os.path.join(anchor, '.' + name + '.staging-' + uuid.uuid4().hex)
        os.mkdir(staging, 0o700)
        try:
            for f in a['files']:
                path = os.path.join(staging, *f['path'].split('/'))
                os.makedirs(os.path.dirname(path), mode=0o755, exist_ok=True)
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o755 if f['executable'] else 0o644)
                with os.fdopen(fd, 'wb') as out: out.write(base64.b64decode(f['data']))
            os.chmod(staging, 0o755)
            libc = ctypes.CDLL(None, use_errno=True)
            # musl has no renameat2 wrapper: call the syscall itself (x86_64 316, aarch64 276); RENAME_NOREPLACE = 1.
            number = {'x86_64': 316, 'aarch64': 276}.get(os.uname().machine)
            if number is None: print(json.dumps(dict(error='unsupported workspace architecture for atomic publication'))); sys.exit(0)
            libc.syscall.restype = ctypes.c_long
            if libc.syscall(ctypes.c_long(number), ctypes.c_int(-100), ctypes.c_char_p(staging.encode()), ctypes.c_int(-100), ctypes.c_char_p(target.encode()), ctypes.c_uint(1)) != 0:
                err = ctypes.get_errno()
                print(json.dumps(dict(conflict=err == 17, error=os.strerror(err)))); sys.exit(0)
            staging = None
            print(json.dumps(dict(directory=target)))
        finally:
            if staging: shutil.rmtree(staging, ignore_errors=True)
        `.replace(/^        /gm, '');
        try {
            const reply = await ctx.fns.remote.exec({ host: draft.workspace.host, command: 'exec python3 -I -B -S -c ' + ctx.fns.remote.quote({ value: program }), stdin: JSON.stringify({ anchor, name: draft.name, files }), timeout: 60, maxOutput: 8_192 });
            if (reply.timedOut) return { ok: false, reason: 'writing to the SSH workspace timed out; inspect the destination before retrying' };
            if (reply.exitCode !== 0) return { ok: false, reason: 'cannot write to the SSH workspace (Python 3 on Linux is required)' };
            const result = JSON.parse(reply.stdout) as { directory?: string; conflict?: boolean; error?: string };
            if (result.conflict) return { ok: false, conflict: true, reason: draft.skillId + ' already exists; nothing was overwritten' };
            if (typeof result.directory !== 'string') return { ok: false, reason: result.error ?? 'invalid SSH publish response' };
            return { ok: true, directory: result.directory };
        } catch {
            return { ok: false, reason: 'the SSH connection failed during publication; inspect the destination before retrying' };
        }
    }

    let anchor: string;
    if (draft.destination === 'workspace') anchor = join(draft.workspace.dir, '.mauzcode', 'skills');
    else {
        const library = await ctx.fns.skills.serverLibrary({ workspace: draft.workspace });
        if (!library.ok) return { ok: false, reason: library.reason };
        anchor = draft.destination === 'serverGlobal' ? library.globalDir : library.projectDir;
        mkdirSync(anchor, { recursive: true, mode: 0o700 });
        if (draft.destination === 'serverProject') {
            try { writeFileSync(join(anchor, 'project.json'), JSON.stringify({ host: draft.workspace.host, dir: draft.workspace.dir }) + '\n', { mode: 0o600, flag: 'wx' }); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return { ok: false, reason: 'cannot record the project branch' }; }
        }
    }
    const target = join(anchor, draft.name);
    try { lstatSync(target); return { ok: false, conflict: true, reason: draft.skillId + ' already exists; nothing was overwritten' }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return { ok: false, reason: 'cannot inspect the destination' }; }
    mkdirSync(anchor, { recursive: true, mode: 0o755 });
    const staging = mkdtempSync(join(anchor, '.' + draft.name + '.staging-'));
    let published = false;
    try {
        for (const file of files) {
            const path = join(staging, file.path);
            mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
            writeFileSync(path, Buffer.from(file.data, 'base64'), { mode: file.executable ? 0o755 : 0o644, flag: 'wx' });
            chmodSync(path, file.executable ? 0o755 : 0o644);
        }
        chmodSync(staging, 0o755);
        const { dlopen, FFIType, ptr } = await import('bun:ffi');
        const libc = dlopen(process.platform === 'linux' ? 'libc.so.6' : 'libc.dylib', { renameat2: { args: [FFIType.i32, FFIType.ptr, FFIType.i32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 } });
        const from = Buffer.from(staging + '\0');
        const to = Buffer.from(target + '\0');
        if (libc.symbols.renameat2(-100, ptr(from), -100, ptr(to), 1) !== 0) {
            libc.close();
            // EEXIST is the only expected failure: another writer published the same ID first.
            try { lstatSync(target); return { ok: false, conflict: true, reason: draft.skillId + ' already exists; nothing was overwritten' }; } catch {}
            return { ok: false, reason: 'the package could not be moved into place' };
        }
        libc.close();
        published = true;
        return { ok: true, directory: target };
    } catch {
        return { ok: false, reason: 'cannot write the package' };
    } finally {
        if (!published) {
            rmSync(staging, { recursive: true, force: true });
        }
    }
}
