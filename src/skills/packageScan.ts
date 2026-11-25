/**
 * Scans the immediate package directories of one trusted skill root, reading only each bounded SKILL.md manifest header.
 *
 * Discover Agent Skills packages without reading or retaining any package body. The anchor is a trusted absolute container directory supplied by a future adapter (a configured skills root or a plugin package directory); untrusted child names and every opened object are verified on the open descriptor, so symlinked packages, symlinked directories and traversal cannot escape the permitted container. Container entries are counted as they are listed, never buffered as an unlimited name array. One malformed, oversized or unreadable package yields a bounded package-scoped diagnostic and never affects its healthy neighbours. Returns private entries (qualified identity through skills.qualifiedId, the sole identity authority, plus directory name, manifest parsed by skills.parseManifest and header bytes); no filesystem location is ever exposed, guessed or substituted. Local filesystem only: no SSH, database, cache, enablement rules, publication or execution.
 * @param opts.anchorDir Trusted absolute, normalized directory whose immediate child directories are candidate packages.
 * @param opts.sourceKind Origin family passed unchanged to skills.qualifiedId: workspace, serverProject, serverGlobal or plugin.
 * @param opts.root Named workspace root segment for qualified identities; only valid with sourceKind workspace.
 * @param opts.plugin Plugin namespace segment for qualified identities; only valid with sourceKind plugin.
 * @param opts.pluginLabel Trusted plugin display name passed to skills.qualifiedId; only for plugin packages.
 * @param opts.packageLimit Smaller number of healthy packages returned, counted while scanning; only malformed neighbours are skipped, never charged to this budget. @default 100 @minimum 1 @maximum 100
 * @param opts.entryLimit Smaller number of container entries examined, counted while listing; further entries are reported as truncated. @default 400 @minimum 1 @maximum 400
 * @param opts.headerMaxBytes Smaller SKILL.md header budget in bytes, stopping after the closing --- line and never entering the body. @default 16384 @minimum 512 @maximum 16384
 * @param opts.only Trusted package directory name to examine alone, ignoring its siblings; used for one explicitly exported plugin package.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted absolute, normalized directory whose immediate child directories are candidate packages. */
        anchorDir: string;
        /** Origin family passed unchanged to skills.qualifiedId: workspace, serverProject, serverGlobal or plugin. */
        sourceKind: 'workspace' | 'serverProject' | 'serverGlobal' | 'plugin';
        /** Named workspace root segment for qualified identities; only valid with sourceKind workspace. */
        root?: string;
        /** Plugin namespace segment for qualified identities; only valid with sourceKind plugin. */
        plugin?: string;
        /** Trusted plugin display name passed to skills.qualifiedId; only for plugin packages. */
        pluginLabel?: string;
        /** Smaller number of healthy packages returned, counted while scanning; only malformed neighbours are skipped, never charged to this budget. @default 100 @minimum 1 @maximum 100 */
        packageLimit?: number;
        /** Smaller number of container entries examined, counted while listing; further entries are reported as truncated. @default 400 @minimum 1 @maximum 400 */
        entryLimit?: number;
        /** Smaller SKILL.md header budget in bytes, stopping after the closing --- line and never entering the body. @default 16384 @minimum 512 @maximum 16384 */
        headerMaxBytes?: number;
        /** Trusted package directory name to examine alone, ignoring its siblings; used for one explicitly exported plugin package. */
        only?: string;
    },
): Promise<types.skills.ScanResult> {
    const limits = await ctx.fns.skills.packageLimits({});
    const { constants, openSync, opendirSync, readSync, fstatSync, closeSync } = await import('node:fs');
    const O_PATH = 0o10_000_000;
    const S_IFMT = 0o17_0000;
    const S_IFREG = 0o10_0000;
    const S_IFLNK = 0o12_0000;
    const NAME_MAX = 64;
    const MAX_PATH = 4_096;
    const MAX_COMPONENT = 255;
    const DASH = 0x2d;
    const LF = 0x0a;
    const CR = 0x0d;
    const SPACE = 0x20;
    const TAB = 0x09;
    const procOf = (fd: number): string => '/proc/self/fd/' + fd;
    const fail = (reason: string): types.skills.ScanResult => ({ ok: false, reason });
    const ioReason = (error: unknown): string => {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
        return ['ENOENT', 'EACCES', 'EPERM', 'ELOOP', 'ENOTDIR', 'EISDIR', 'ENXIO', 'EOVERFLOW', 'EMFILE', 'ENFILE', 'ENAMETOOLONG'].includes(code) ? code : 'the object could not be opened';
    };
    /** Take the documented ceiling, or a smaller positive integer the caller prefers: a caller may narrow a budget, never widen it. */
    const lowered = (value: number | undefined, documented: number): number => (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value < documented ? value : documented);
    const closeQuietly = (fd: number): void => {
        if (fd < 0) return;
        // Best-effort cleanup must not replace the original I/O result; close is never retried.
        try { closeSync(fd); } catch {}
    };
    const openDirAt = (at: number, name: string): number => openSync(procOf(at) + '/' + name, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NOCTTY | constants.O_NONBLOCK);
    const isPackageName = (value: string): boolean => value.length > 0 && value.length <= NAME_MAX && /^[a-z0-9](?:-?[a-z0-9])*$/.test(value);
    if (typeof opts.anchorDir !== 'string' || opts.anchorDir.length === 0) return fail('anchorDir must be a trusted absolute directory');
    if (!opts.anchorDir.startsWith('/')) return fail('anchorDir must be an absolute path');
    if (opts.anchorDir.length > MAX_PATH) return fail('anchorDir is too long');
    if (opts.anchorDir.includes(String.fromCharCode(0))) return fail('anchorDir contains a NUL byte');
    if (opts.anchorDir.length > 1 && (opts.anchorDir.endsWith('/') || opts.anchorDir.includes('//'))) return fail('anchorDir must be normalized, without a trailing or doubled slash');
    for (const part of opts.anchorDir.split('/')) if (part === '.' || part === '..') return fail('anchorDir must be normalized, without . or .. components');
    const sourceKind = opts.sourceKind;
    if (sourceKind !== 'workspace' && sourceKind !== 'serverProject' && sourceKind !== 'serverGlobal' && sourceKind !== 'plugin') return fail('sourceKind must be workspace, serverProject, serverGlobal or plugin');
    if (opts.root !== undefined && sourceKind !== 'workspace') return fail('root applies only to workspace packages');
    if ((opts.plugin !== undefined || opts.pluginLabel !== undefined) && sourceKind !== 'plugin') return fail('plugin fields apply only to plugin packages');
    const locator: types.skills.PackageLocator = { anchorDir: opts.anchorDir, components: [] };
    const packageLimit = lowered(opts.packageLimit, limits.packages);
    const entryLimit = lowered(opts.entryLimit, limits.entries);
    const headerMaxBytes = lowered(opts.headerMaxBytes, limits.headerBytes);
    /** Clip one diagnostic so the reported line, ellipsis included, never exceeds the documented character budget. */
    const clipSuffix = '...';
    const clip = (value: string): string => (value.length <= limits.diagnosticChars ? value : value.slice(0, Math.max(0, limits.diagnosticChars - clipSuffix.length)) + clipSuffix);
    const diagnostics: string[] = [];
    let diagnosticsFull = false;
    const push = (message: string): void => {
        if (diagnostics.length < limits.diagnostics) diagnostics.push(clip(message));
        else diagnosticsFull = true;
    };
    /** Verify on an O_PATH descriptor, before a byte is read, that a child name is a regular file inside the opened directory. */
    const probe = (at: number, name: string): { ok: true; dev: number; ino: number } | { ok: false; reason: string } => {
        let fd: number = -1;
        try {
            fd = openSync(procOf(at) + '/' + name, O_PATH | constants.O_NOFOLLOW);
            const st = fstatSync(fd);
            const type = st.mode & S_IFMT;
            if (type === S_IFLNK) return { ok: false, reason: name + ' must not be a symbolic link' };
            if (type !== S_IFREG) return { ok: false, reason: name + ' must be a regular file, not a directory or special file' };
            return { ok: true, dev: st.dev, ino: st.ino };
        } catch (error) {
            return { ok: false, reason: ioReason(error) };
        } finally {
            closeQuietly(fd);
        }
    };
    /**
     * Read exactly the bytes through the closing delimiter line of one manifest and not one byte more.
     *
     * The delimiter is located by a stateful one-byte automaton, so the number of bytes physically read from the
     * file equals the number of header bytes returned: the instructions body is never touched, which a chunk read
     * cannot promise even when it discards the extra bytes. At most maxBytes + 1 bytes are ever read, so a package
     * whose header does not close within the budget costs one byte of proof and no more.
     */
    const readHeader = (at: number, maxBytes: number): { ok: true; text: string; bytes: number } | { ok: false; reason: string } => {
        const guard = probe(at, 'SKILL.md');
        if (!guard.ok) return { ok: false, reason: guard.reason };
        const unclosed = 'SKILL.md must begin with a YAML frontmatter block that its own --- line closes';
        const oversized = 'the manifest header exceeds ' + maxBytes + ' bytes';
        const buffer = Buffer.allocUnsafe(maxBytes + 1);
        const byte = Buffer.allocUnsafe(1);
        // 0 opening ---, 1 opening tail, 2 opening CR awaiting LF, 3 inside the block, 4 line CR awaiting LF
        let mode: 0 | 1 | 2 | 3 | 4 = 0;
        let dashes = 0;
        let tailOk = true;
        let total = 0;
        let fd: number = -1;
        // A block that closes past the budget is oversized, not accepted: the delimiter line itself must fit.
        const closed = (): { ok: true; text: string; bytes: number } | { ok: false; reason: string } => (total > maxBytes ? { ok: false, reason: oversized } : { ok: true, text: buffer.subarray(0, total).toString('utf8'), bytes: total });
        try {
            fd = openSync(procOf(at) + '/SKILL.md', constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NOCTTY | constants.O_NONBLOCK);
            const opened = fstatSync(fd);
            if (!opened.isFile() || opened.dev !== guard.dev || opened.ino !== guard.ino) return { ok: false, reason: 'SKILL.md changed while it was being opened' };
            while (true) {
                const read = total <= maxBytes ? readSync(fd, byte, 0, 1, total) : 0;
                if (read === 0) break;
                const value = byte[0]!;
                total++;
                buffer[total - 1] = value;
                if (mode === 0) {
                    if (total <= 3) {
                        if (value !== DASH) return { ok: false, reason: unclosed };
                        continue;
                    }
                    mode = 1;
                }
                if (mode === 1) {
                    if (value === SPACE || value === TAB) continue;
                    if (value === LF) {
                        mode = 3;
                        dashes = 0;
                        tailOk = true;
                        continue;
                    }
                    if (value === CR) {
                        mode = 2;
                        continue;
                    }
                    return { ok: false, reason: unclosed };
                }
                if (mode === 2) {
                    if (value !== LF) return { ok: false, reason: unclosed };
                    mode = 3;
                    dashes = 0;
                    tailOk = true;
                    continue;
                }
                if (mode === 4) {
                    if (value !== LF) {
                        mode = 3;
                        tailOk = false;
                    } else {
                        const close = dashes === 3 && tailOk;
                        mode = 3;
                        dashes = 0;
                        tailOk = true;
                        if (close) return closed();
                        continue;
                    }
                }
                // mode 3: one line of the block, classified as it arrives and never rescanned
                if (value === LF) {
                    const close = dashes === 3 && tailOk;
                    dashes = 0;
                    tailOk = true;
                    if (close) return closed();
                    continue;
                }
                if (value === CR) {
                    mode = 4;
                    continue;
                }
                if (value === DASH && dashes < 4 && tailOk) {
                    dashes++;
                    continue;
                }
                if ((value === SPACE || value === TAB) && dashes === 3) continue;
                tailOk = false;
            }
            // End of file without a trailing newline: the last line may still be the closing delimiter.
            if (mode === 3 && dashes === 3 && tailOk) return closed();
            if (mode === 0) return { ok: false, reason: unclosed };
            return { ok: false, reason: total > maxBytes ? oversized : unclosed };
        } catch (error) {
            return { ok: false, reason: ioReason(error) };
        } finally {
            closeQuietly(fd);
        }
    };
    // Containment is proved by binding every open to a directory descriptor through /proc/self/fd, which only Linux
    // provides. Elsewhere the layer refuses to guess: no scan is attempted rather than falling back to a path-based
    // open that could follow a link out of the package.
    if (process.platform !== 'linux') return fail('bounded package access needs the Linux /proc/self/fd descriptor binding, which this platform does not provide');
    let anchorFd: number = -1;
    try {
        anchorFd = openSync(locator.anchorDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NOCTTY | constants.O_NONBLOCK);
    } catch (error) {
        return fail('cannot open the trusted anchor: ' + ioReason(error));
    }
    try {
        const anchorIdentity = fstatSync(anchorFd);
        const candidates: string[] = [];
        let listed = 0;
        let truncated = false;
        let handle: ReturnType<typeof opendirSync>;
        try {
            handle = opendirSync(procOf(anchorFd));
        } catch (error) {
            return fail('cannot list the trusted anchor: ' + ioReason(error));
        }
        try {
            let record: ReturnType<typeof handle.readSync>;
            while ((record = handle.readSync()) !== null) {
                // A single trusted export ignores its siblings without charging them to the scan budget.
                if (opts.only !== undefined && record.name !== opts.only) continue;
                if (listed >= entryLimit) {
                    truncated = true;
                    break;
                }
                listed++;
                const name = record.name;
                // Dot entries are private staging and lock files of publication, never packages.
                if (name.startsWith('.')) continue;
                if (!isPackageName(name)) {
                    if (record.isDirectory()) push('package ' + clip(name) + ': rejected as a package directory name');
                    continue;
                }
                if (record.isSymbolicLink()) {
                    push('package ' + name + ': rejected because it is a symbolic link, not a directory inside the permitted container');
                    continue;
                }
                if (!record.isDirectory()) {
                    if (record.isFile() && name === 'SKILL.md') push('SKILL.md at the container level names no package: packages are directories');
                    continue;
                }
                candidates.push(name);
            }
        } catch (error) {
            return fail('cannot list the trusted anchor: ' + ioReason(error));
        } finally {
            // Best-effort cleanup must preserve the result of listing the anchor.
            try { handle.closeSync(); } catch {}
        }
        candidates.sort();
        const packages: types.skills.PackageEntry[] = [];
        let examined = 0;
        for (const name of candidates) {
            if (packages.length >= packageLimit) break;
            examined++;
            let packageFd: number = -1;
            try {
                packageFd = openDirAt(anchorFd, name);
            } catch (error) {
                push('package ' + name + ': ' + ioReason(error));
                continue;
            }
            try {
                const opened = fstatSync(packageFd);
                if (opened.dev !== anchorIdentity.dev || opened.ino === anchorIdentity.ino) {
                    push('package ' + name + ': rejected because it is not a directory inside the permitted container');
                    continue;
                }
                const header = readHeader(packageFd, headerMaxBytes);
                if (!header.ok) {
                    push('package ' + name + ': ' + header.reason);
                    continue;
                }
                const parsed = await ctx.fns.skills.parseManifest({ text: header.text, directoryName: name });
                if (!parsed.ok) {
                    push(parsed.reason);
                    continue;
                }
                const identity = await ctx.fns.skills.qualifiedId({ sourceKind, name: parsed.manifest.name, root: opts.root, plugin: opts.plugin, pluginLabel: opts.pluginLabel, description: parsed.manifest.description });
                if (!identity.ok) {
                    push('package ' + name + ': ' + identity.reason);
                    continue;
                }
                packages.push({ descriptor: identity.id, directoryName: name, manifest: parsed.manifest, headerBytes: header.bytes });
            } catch (error) {
                push('package ' + name + ': ' + ioReason(error));
            } finally {
                closeQuietly(packageFd);
            }
        }
        if (examined < candidates.length) truncated = true;
        if (diagnosticsFull) {
            truncated = true;
            if (diagnostics.length < limits.diagnostics) push('further diagnostics were suppressed by the limit of ' + limits.diagnostics);
        }
        return { ok: true, packages, diagnostics, truncated };
    } catch (error) {
        return fail('cannot inspect the trusted anchor: ' + ioReason(error));
    } finally {
        closeQuietly(anchorFd);
    }
}
