import { closeSync, constants, fstatSync, openSync, readlinkSync, readSync, realpathSync } from 'node:fs';
import { posix } from 'node:path';
type WorkspaceTransportResult =
    | { ok: true; action: 'config'; text: string | null }
    | { ok: true; action: 'scan'; packages: types.skills.PackageEntry[]; diagnostics: string[]; truncated: boolean }
    | types.skills.FilesResult;
/**
 * Read bounded skill data from one approved workspace directory on its own host.
 *
 * The configuration and every root are opened beneath the trusted workspace by descriptor, without following child symlinks. Local packages use the shared package readers. SSH sends a fixed read-only program to Linux Python 3 and receives bounded data; paths are never shell source and SSH failure never falls back to server files.
 * @param opts.workspace Internal trusted workspace identity with its absolute directory and SSH alias (empty for local).
 * @param opts.action Read the fixed config file, scan one root, list one package, or read one bounded page.
 * @param opts.directory Internal normalized workspace-relative root; only the built-in or a declared root.
 * @param opts.root Internal validated named root qualifier; omitted only for the built-in root or config.
 * @param opts.packageName Package directory name from a checked workspace skill ID, for list or read.
 * @param opts.path Package-relative file for the read action.
 * @param opts.offset Byte offset for the read action. @default 0 @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Internal trusted workspace identity with its absolute directory and SSH alias (empty for local). */
        workspace: { host: string; dir: string };
        /** Read the fixed config file, scan one root, list one package, or read one bounded page. */
        action: 'config' | 'scan' | 'list' | 'read';
        /** Internal normalized workspace-relative root; only the built-in or a declared root. */
        directory?: string;
        /** Internal validated named root qualifier; omitted only for the built-in root or config. */
        root?: string;
        /** Package directory name from a checked workspace skill ID, for list or read. */
        packageName?: string;
        /** Package-relative file for the read action. */
        path?: string;
        /** Byte offset for the read action. @default 0 @minimum 0 */
        offset?: number;
    },
): Promise<WorkspaceTransportResult> {
    const fail = (reason: string): WorkspaceTransportResult => ({ ok: false, reason });
    const invalid = () => fail('invalid workspace reader response');
    const { action, root, packageName, path } = opts;
    const host = opts.workspace?.host;
    const dir = opts.workspace?.dir;
    const valid = (value: string) => !/[\\\u0000-\u001f\u007f\ud800-\udfff]/u.test(value);
    const components = (value: string) => value.split('/').every(part =>
        part && part !== '.' && part !== '..' && Buffer.byteLength(part) <= 255);
    const name = (value: string) => value.length <= 64 && valid(value) && /^[a-z0-9](?:-?[a-z0-9])*$/.test(value);
    if (typeof host !== 'string' || (host !== '' && !/^[A-Za-z0-9][A-Za-z0-9._@-]*$/.test(host)) ||
        typeof dir !== 'string' || !dir.startsWith('/') || Buffer.byteLength(dir) > 4_096 || !valid(dir) ||
        (dir !== '/' && !components(dir.slice(1)))) return fail('expected a trusted absolute workspace identity');
    if (action !== 'config' && action !== 'scan' && action !== 'list' && action !== 'read') return fail('unknown workspace reader action');
    const builtin = '.mauzcode/skills';
    const relative = action === 'config' ? '.mauzcode' : opts.directory;
    if (typeof relative !== 'string' || Buffer.byteLength(relative) > 1_024 || !valid(relative) || !components(relative) ||
        (action !== 'config' && (root === undefined ? relative !== builtin : typeof root !== 'string' || !name(root)))) {
        return fail('invalid workspace-relative root');
    }
    const reserved = ['.mauzcode', 'src', 'plugins', 'node_modules'];
    const overlap = (a: string, b: string) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
    if (action !== 'config' && root !== undefined && reserved.some(source => overlap(source, relative))) {
        return fail('root overlaps a reserved runtime source');
    }
    const configBytes = 32_768;
    const limits = await ctx.fns.skills.packageLimits({});
    const offset = opts.offset ?? 0;
    const resourcePath = (candidate: string) => valid(candidate) && Buffer.byteLength(candidate) <= 4_096 &&
        candidate.split('/').length <= limits.depth + 1 && components(candidate) &&
        candidate.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(part));
    if ((action === 'list' || action === 'read') && (typeof packageName !== 'string' || !name(packageName))) return fail('invalid workspace package name');
    if (action === 'read' && (typeof path !== 'string' || !resourcePath(path) || !Number.isSafeInteger(offset) || offset < 0)) return fail('invalid workspace package file or offset');
    const decode = (data: Uint8Array) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
    const absentRoot = (): WorkspaceTransportResult => ({ ok: true, action: 'scan', packages: [], diagnostics: [], truncated: false });
    if (!host) {
        if (process.platform !== 'linux') return fail('workspace skills require Linux descriptor-bound reads');
        const noFollow = constants.O_NOFOLLOW | constants.O_NONBLOCK | constants.O_NOCTTY;
        const dirFlags = constants.O_RDONLY | constants.O_DIRECTORY | noFollow;
        const proc = (fd: number) => '/proc/self/fd/' + fd;
        const handles: number[] = [];
        const opened = (path: string, flags: number): number => {
            const fd = openSync(path, flags);
            handles.push(fd);
            return fd;
        };
        const code = (error: unknown) => (error as NodeJS.ErrnoException)?.code;
        try {
            const workspace = realpathSync(dir);
            let fd = opened(workspace, dirFlags);
            const device = fstatSync(fd).dev;
            const segments = relative.split('/');
            let anchor = '';
            for (const segment of segments) {
                anchor = proc(fd) + '/' + segment;
                try { fd = opened(anchor, dirFlags); }
                catch (error) {
                    if (code(error) === 'ENOENT') {
                        if (action === 'config') return { ok: true, action, text: null };
                        if (action === 'scan' && root === undefined) return absentRoot();
                    }
                    return fail('cannot open the workspace directory');
                }
                if (fstatSync(fd).dev !== device) return fail('workspace directory crosses a filesystem boundary');
            }
            const expected = posix.join(workspace, relative);
            if (readlinkSync(proc(fd)) !== expected) return fail('workspace data directory is outside the workspace or has moved');
            if (action === 'config') {
                let probe: number;
                try { probe = opened(proc(fd) + '/skills.json', 0x20_0000 | constants.O_NOFOLLOW); } // Linux O_PATH
                catch (error) {
                    if (code(error) === 'ENOENT') return { ok: true, action, text: null };
                    return fail('cannot open the workspace config');
                }
                const status = fstatSync(probe);
                if (!status.isFile() || status.dev !== device) return fail('workspace config is not a regular file');
                if (status.size > configBytes) return fail('workspace config exceeds 32768 bytes');
                const reader = opened(proc(probe), constants.O_RDONLY | constants.O_NONBLOCK);
                const buffer = Buffer.alloc(configBytes + 1);
                let size = 0;
                while (size < buffer.length) {
                    const count = readSync(reader, buffer, size, buffer.length - size, size);
                    if (count === 0) break;
                    size += count;
                }
                if (size > configBytes) return fail('workspace config exceeds 32768 bytes');
                if (readlinkSync(proc(fd)) !== expected) return fail('workspace config directory moved while reading');
                return { ok: true, action, text: decode(buffer.subarray(0, size)) };
            }
            if (root !== undefined) {
                const sourceRoots = ctx.fns.procs.modules.list({}).map(module => module.dir);
                for (const source of reserved) {
                    try { sourceRoots.push(realpathSync(proc(handles[0]!) + '/' + source)); }
                    catch (error) { if (code(error) !== 'ENOENT') return fail('cannot verify a reserved runtime source'); }
                }
                const checked = ctx.fns.procs.project.skillData({ path: anchor, sourceRoots });
                if (checked.blocked || checked.canonical !== expected) return fail('root overlaps a runtime source or cannot be verified');
            }
            // The shared reader opens the final component with O_NOFOLLOW. Its parent stays pinned until it returns.
            if (action === 'scan') {
                const result = await ctx.fns.skills.packageScan({ anchorDir: anchor, sourceKind: 'workspace', root });
                if (readlinkSync(proc(fd)) !== expected) return fail('workspace data directory moved while reading');
                return result.ok ? { ...result, action } : result;
            }
            const result = await ctx.fns.skills.packageFiles({ anchorDir: anchor, packageName: packageName!, action, path, offset });
            return readlinkSync(proc(fd)) === expected ? result : fail('workspace data directory moved while reading');
        } catch {
            return fail('cannot safely read workspace skill data');
        } finally {
            for (const fd of handles.reverse()) try { closeSync(fd); } catch {}
        }
    }

    // The program is fixed; all paths and limits travel as JSON on stdin. Isolated mode ignores PYTHONPATH and never imports from the workspace.
    const program = String.raw`
    import base64, contextlib, json, os, re, stat, sys
    if sys.platform != 'linux' or not hasattr(os, 'O_PATH') or not os.path.isdir('/proc/self/fd'):
        sys.exit(125)
    a = json.load(sys.stdin)
    l, action = a['limits'], a['action']
    flags = os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK
    class Refused(Exception): pass

    def proc(fd): return '/proc/self/fd/' + str(fd)

    def same_device(fd):
        if os.fstat(fd).st_dev != device: raise Refused('workspace object crosses a filesystem boundary')

    def open_dir(stack, parent, part):
        fd = os.open(part, flags, dir_fd=parent)
        stack.callback(os.close, fd)
        same_device(fd)
        return fd

    def probe(stack, parent, part):
        fd = os.open(part, os.O_PATH | os.O_NOFOLLOW, dir_fd=parent)
        stack.callback(os.close, fd)
        return fd, os.fstat(fd)

    def reader(stack, fd, st):
        if not stat.S_ISREG(st.st_mode): raise Refused('workspace object is not a regular file')
        same_device(fd)
        data = os.open(proc(fd), os.O_RDONLY | os.O_NONBLOCK | os.O_NOCTTY)
        stack.callback(os.close, data)
        return data

    def raw_read(fd, size, offset=0):
        out = bytearray()
        while len(out) < size:
            b = os.pread(fd, size - len(out), offset + len(out))
            if not b: break
            out.extend(b)
        return out

    def encode(data): return base64.b64encode(data).decode('ascii')

    def header(fd, size):
        data = bytearray()
        line = bytearray()
        first = True
        # Stop on the closing newline. Do not prefetch any instruction bytes.
        for _ in range(min(size, l['headerBytes'])):
            b = os.read(fd, 1)
            if not b: break
            data.extend(b)
            if b != b'\n':
                line.extend(b)
                continue
            delimiter = re.fullmatch(br'---[ \t]*\r?', line) is not None
            if first and not delimiter: break
            if not first and delimiter: return encode(data)
            first = False
            line.clear()
        else:
            if len(data) == size and not first and re.fullmatch(br'---[ \t]*', line): return encode(data)
        raise Refused('SKILL.md has no complete header within its byte limit')

    def scan(root):
        names, diagnostics, packages = [], [], []
        truncated = False
        def note(reason):
            nonlocal truncated
            if len(diagnostics) < l['diagnostics']: diagnostics.append(reason)
            else: truncated = True
        with os.scandir(root) as entries:
            for i, entry in enumerate(entries):
                if i == l['entries']:
                    truncated = True
                    break
                if len(entry.name) <= 64 and re.fullmatch(r'[a-z0-9](?:-?[a-z0-9])*', entry.name) and entry.is_dir(follow_symlinks=False):
                    names.append(entry.name)
        for part in sorted(names):
            try:
                with contextlib.ExitStack() as files:
                    package = open_dir(files, root, part)
                    f, st = probe(files, package, 'SKILL.md')
                    result = header(reader(files, f, st), st.st_size)
                    packages.append([part, result])
            except Refused as error: note('package ' + part + ': ' + str(error))
            except OSError: note('package ' + part + ': cannot open a regular SKILL.md')
        return dict(packages=packages, diagnostics=diagnostics, truncated=truncated)

    def package_files(root, files):
        package = open_dir(files, root, a['packageName'])
        manifest, info = probe(files, package, 'SKILL.md')
        if not stat.S_ISREG(info.st_mode): raise Refused('package has no regular SKILL.md')
        same_device(manifest)
        resources, complete, skipped, entries, total, truncated = [], True, 0, 0, 0, False
        def inventory(at, base, depth):
            nonlocal entries, total, complete, skipped, truncated
            with os.scandir(at) as names:
                for item in names:
                    if entries >= l['resourceEntries']:
                        complete = False
                        return
                    entries += 1
                    relative = base + item.name
                    with contextlib.ExitStack() as child:
                        try: fd, st = probe(child, at, item.name)
                        except OSError:
                            complete = False
                            continue
                        if st.st_dev != device:
                            complete = False
                            skipped += 1
                            continue
                        usable = re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', item.name) is not None
                        if stat.S_ISREG(st.st_mode):
                            total += st.st_size
                            if total > l['packageBytes']: raise Refused('package exceeds its byte limit')
                            if relative == 'SKILL.md': continue
                            if not usable or st.st_size > l['resourceBytes']: skipped += 1
                            elif len(resources) < l['resources']: resources.append(dict(path=relative, bytes=st.st_size, executable=True) if st.st_mode & 0o111 else dict(path=relative, bytes=st.st_size))
                            else: truncated = True
                        elif stat.S_ISDIR(st.st_mode):
                            if not usable or depth >= l['depth']:
                                complete = False
                                skipped += 1
                            else:
                                try: child_dir = open_dir(child, at, item.name)
                                except (OSError, Refused):
                                    complete = False
                                    continue
                                if os.fstat(child_dir).st_ino != st.st_ino:
                                    complete = False
                                    continue
                                inventory(child_dir, relative + '/', depth + 1)
                        else: skipped += 1
        inventory(package, '', 0)
        if action == 'list':
            result = dict(resources=sorted(resources, key=lambda item: item['path']), manifestBytes=info.st_size,
                          manifestOversized=info.st_size > l['instructionsBytes'], skipped=skipped, truncated=truncated or not complete)
            if complete: result['packageBytes'] = total
            return result
        if not complete: raise Refused('package total could not be verified within the documented limits')
        at = package
        parts = a['path'].split('/')
        for part in parts[:-1]: at = open_dir(files, at, part)
        file, st = probe(files, at, parts[-1])
        cap = l['instructionsBytes'] if a['path'] == 'SKILL.md' else l['resourceBytes']
        if st.st_size > cap: raise Refused('requested file exceeds its byte limit')
        offset = a['offset']
        if offset > st.st_size: raise Refused('offset is past the end of the file')
        size = min(l['pageBytes'], st.st_size - offset)
        data = raw_read(reader(files, file, st), size, offset)
        if len(data) != size: raise Refused('file changed while being read')
        return dict(data=encode(data), total=st.st_size)

    def run():
        global device
        with contextlib.ExitStack() as stack:
            ws = os.open(a['dir'], flags)
            stack.callback(os.close, ws)
            device = os.fstat(ws).st_dev
            fd = ws
            try:
                for part in a['relative'].split('/'): fd = open_dir(stack, fd, part)
            except FileNotFoundError:
                if action == 'config' or (action == 'scan' and a['root'] is None): return dict(missing=True)
                raise
            canonical = os.readlink(proc(ws))
            expected = os.path.join(canonical, a['relative'])
            if os.readlink(proc(fd)) != expected: raise Refused('workspace data directory is outside the workspace or has moved')
            if action == 'config':
                try: f, st = probe(stack, fd, 'skills.json')
                except FileNotFoundError: return dict(missing=True)
                cap = a['configBytes']
                if st.st_size > cap: raise Refused('workspace config exceeds 32768 bytes')
                data = raw_read(reader(stack, f, st), cap + 1)
                if len(data) > cap: raise Refused('workspace config exceeds 32768 bytes')
                if os.readlink(proc(fd)) != expected: raise Refused('workspace config directory moved while reading')
                return dict(data=encode(data))
            if a['root'] is not None:
                def overlap(x, y): return os.path.commonpath([x, y]) in (x, y)
                for entry in a['reserved']:
                    source = os.path.realpath(os.path.join(proc(ws), entry))
                    if overlap(source, expected): raise Refused('root overlaps a runtime source')
            result = scan(fd) if action == 'scan' else package_files(fd, stack)
            if os.readlink(proc(fd)) != expected: raise Refused('workspace data directory moved while reading')
            return result

    try: result = run()
    except Refused as error: result = dict(error=str(error))
    except OSError: result = dict(error='cannot safely open workspace skill data')
    print(json.dumps(result, ensure_ascii=True, separators=(',', ':')), flush=True)
    `.replace(/^    /gm, '');
    try {
        const reply = await ctx.fns.remote.exec({
            host, command: 'exec python3 -I -B -S -c ' + ctx.fns.remote.quote({ value: program }),
            stdin: JSON.stringify({ dir, relative, action, root: root ?? null, packageName, path, offset, limits, reserved, configBytes }),
            timeout: 8,
            maxOutput: action === 'scan' ? limits.entries * (Math.ceil(limits.headerBytes / 3) * 4 + 80) + 8_192 :
                action === 'list' ? limits.resources * 2_400 + 1_024 : Math.ceil(Math.max(configBytes, limits.pageBytes) / 3) * 4 + 1_024,
        });
        if (reply.timedOut) return fail('SSH workspace reader timed out');
        if (reply.exitCode === 125 || reply.exitCode === 127) return fail('SSH workspace skills require Linux with Python 3 and /proc/self/fd');
        if (reply.exitCode !== 0) return fail('SSH workspace reader is unavailable');
        const response = JSON.parse(reply.stdout) as Record<string, unknown>;
        if (typeof response.error === 'string') return fail(response.error.slice(0, limits.diagnosticChars));
        const unbase64 = (encoded: unknown, max: number): Buffer => {
            if (typeof encoded !== 'string' || encoded.length > Math.ceil(max / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw Error('invalid SSH byte record');
            const result = Buffer.from(encoded, 'base64');
            if (result.length > max || result.toString('base64') !== encoded) throw Error('invalid SSH byte record');
            return result;
        };
        if (action === 'config') return { ok: true, action, text: response.missing === true ? null : decode(unbase64(response.data, configBytes)) };
        if (action === 'scan') {
            if (response.missing === true && root === undefined) return absentRoot();
            const packages: types.skills.PackageEntry[] = [];
            const diagnostics: string[] = [];
            if (!Array.isArray(response.packages) || response.packages.length > limits.entries || !Array.isArray(response.diagnostics) || response.diagnostics.length > limits.diagnostics || typeof response.truncated !== 'boolean') return invalid();
            let truncated = response.truncated;
            const note = (reason: string) => {
                if (diagnostics.length < limits.diagnostics) diagnostics.push(reason.slice(0, limits.diagnosticChars));
                else truncated = true;
            };
            for (const reason of response.diagnostics) {
                if (typeof reason !== 'string') return invalid();
                note(reason);
            }
            for (const item of response.packages) {
                if (packages.length >= limits.packages) { truncated = true; break; }
                if (!Array.isArray(item) || typeof item[0] !== 'string' || !name(item[0])) return invalid();
                const directoryName = item[0];
                const bytes = unbase64(item[1], limits.headerBytes);
                let text: string;
                try { text = decode(bytes); } catch { note('package ' + directoryName + ': SKILL.md header is not UTF-8'); continue; }
                const parsed = await ctx.fns.skills.parseManifest({ directoryName, text });
                if (!parsed.ok) { note(parsed.reason); continue; }
                const id = await ctx.fns.skills.qualifiedId({ sourceKind: 'workspace', root, name: parsed.manifest.name, description: parsed.manifest.description });
                if (!id.ok) { note('package ' + directoryName + ': ' + id.reason); continue; }
                packages.push({ directoryName, descriptor: id.id, manifest: parsed.manifest, headerBytes: bytes.length });
            }
            return { ok: true, action, packages, diagnostics, truncated };
        }
        const boundedInteger = (value: unknown, max: number): value is number =>
            typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
        if (action === 'list') {
            const { resources, manifestBytes, manifestOversized, skipped, truncated, packageBytes } = response;
            if (!Array.isArray(resources) || resources.length > limits.resources || !boundedInteger(manifestBytes, limits.packageBytes) ||
                manifestOversized !== (manifestBytes > limits.instructionsBytes) || !boundedInteger(skipped, limits.resourceEntries) ||
                typeof truncated !== 'boolean' || (packageBytes !== undefined && !boundedInteger(packageBytes, limits.packageBytes))) return invalid();
            const entries: types.skills.ResourceEntry[] = [];
            for (const item of resources) {
                if (typeof item?.path !== 'string' || !resourcePath(item.path) || item.path === 'SKILL.md' || !boundedInteger(item.bytes, limits.resourceBytes) ||
                    (item.executable !== undefined && item.executable !== true)) return invalid();
                entries.push(item.executable ? { path: item.path, bytes: item.bytes, executable: true } : { path: item.path, bytes: item.bytes });
            }
            return { ok: true, action, resources: entries, manifestBytes, manifestOversized, skipped, truncated, ...(packageBytes === undefined ? {} : { packageBytes }) };
        }
        const { total } = response;
        const bytes = unbase64(response.data, limits.pageBytes);
        if (!boundedInteger(total, path === 'SKILL.md' ? limits.instructionsBytes : limits.resourceBytes) || offset > total ||
            bytes.length !== Math.min(limits.pageBytes, total - offset) || !path) return invalid();
        const nextOffset = offset + bytes.length;
        return { ok: true, action, path, bytes, offset, total, nextOffset, hasMore: nextOffset < total };
    } catch {
        return fail('cannot safely read SSH workspace skill data');
    }
}
