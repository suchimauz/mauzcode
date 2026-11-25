/**
 * Inventories the packaged resources of one skill package or reads one bounded page of one file inside it, proving containment on every opened object.
 *
 * Read exactly one package below a trusted anchor: list its packaged resources with verified byte sizes, or return one page of one resource or of SKILL.md. The anchor directory is trusted and every opened object is type-checked on its descriptor before any byte is read, so symbolic links, special files, escaping relative paths and unnormalized anchors are refused instead of followed; callers may narrow a documented budget but never widen it. Package content is returned as inert data and is never imported, executed or registered as runtime code. Local filesystem only: no SSH transport, database, cache, enablement rule or publication.
 * @param opts.anchorDir Trusted absolute, normalized directory whose immediate child directories are packages.
 * @param opts.packageName Untrusted package directory name inside the anchor, one lowercase package name.
 * @param opts.action Bounded action: list packaged resources, or read one page of one file. @default list
 * @param opts.path Package-relative path to read, required by the read action and refused when absolute or containing . or .. components.
 * @param opts.offset Byte offset this page starts at for the read action; a continuation page passes the previous nextOffset. @default 0 @minimum 0
 * @param opts.pageLimit Smaller page size in bytes for the read action; it can only narrow the documented page budget. @default 65536 @minimum 1 @maximum 65536
 * @param opts.resourceLimit Smaller number of files listed for the list action; it can only narrow the documented resource count. @default 500 @minimum 1 @maximum 500
 * @param opts.entryLimit Smaller number of directory entries examined while listing; it can only narrow the documented entry budget. @default 2000 @minimum 1 @maximum 2000
 * @param opts.depthLimit Smaller directory nesting depth followed while listing, counting the package itself as depth 0; it can only narrow the documented depth. @default 8 @minimum 1 @maximum 8
 * @param opts.topLevel Trusted allowlist of top-level package entries besides SKILL.md; others are neither listed, counted nor readable. Narrows a plugin root export to its skill resources.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted absolute, normalized directory whose immediate child directories are packages. */
        anchorDir: string;
        /** Untrusted package directory name inside the anchor, one lowercase package name. */
        packageName: string;
        /** Bounded action: list packaged resources, or read one page of one file. @default list */
        action?: 'list' | 'read';
        /** Package-relative path to read, required by the read action and refused when absolute or containing . or .. components. */
        path?: string;
        /** Byte offset this page starts at for the read action; a continuation page passes the previous nextOffset. @default 0 @minimum 0 */
        offset?: number;
        /** Smaller page size in bytes for the read action; it can only narrow the documented page budget. @default 65536 @minimum 1 @maximum 65536 */
        pageLimit?: number;
        /** Smaller number of files listed for the list action; it can only narrow the documented resource count. @default 500 @minimum 1 @maximum 500 */
        resourceLimit?: number;
        /** Smaller number of directory entries examined while listing; it can only narrow the documented entry budget. @default 2000 @minimum 1 @maximum 2000 */
        entryLimit?: number;
        /** Smaller directory nesting depth followed while listing, counting the package itself as depth 0; it can only narrow the documented depth. @default 8 @minimum 1 @maximum 8 */
        depthLimit?: number;
        /** Trusted allowlist of top-level package entries besides SKILL.md; others are neither listed, counted nor readable. Narrows a plugin root export to its skill resources. */
        topLevel?: string[];
    },
): Promise<types.skills.FilesResult> {
    const limits = await ctx.fns.skills.packageLimits({});
    const { constants, openSync, opendirSync, readSync, fstatSync, closeSync } = await import('node:fs');
    const O_PATH = 0o10_000_000;
    const S_IFMT = 0o17_0000;
    const S_IFDIR = 0o4_0000;
    const S_IFREG = 0o10_0000;
    const S_IFLNK = 0o12_0000;
    const NAME_MAX = 64;
    const MAX_PATH = 4_096;
    const MAX_COMPONENT = 255;
    const procOf = (fd: number): string => '/proc/self/fd/' + fd;
    const ioReason = (error: unknown): string => {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
        return ['ENOENT', 'EACCES', 'EPERM', 'ELOOP', 'ENOTDIR', 'EISDIR', 'ENXIO', 'EOVERFLOW', 'EMFILE', 'ENFILE', 'ENAMETOOLONG'].includes(code) ? code : 'the object could not be opened';
    };
    const closeQuietly = (fd: number): void => {
        if (fd < 0) return;
        // Best-effort cleanup must not replace the original I/O result; close is never retried.
        try { closeSync(fd); } catch {}
    };
    const CLIP_SUFFIX = '...';
    /** Clip one refusal, so an acceptable but long relative name cannot push the answer past the documented length. */
    const clip = (value: string): string => (value.length <= limits.diagnosticChars ? value : value.slice(0, Math.max(0, limits.diagnosticChars - CLIP_SUFFIX.length)) + CLIP_SUFFIX);
    const fail = (reason: string): types.skills.FilesResult => ({ ok: false, reason: clip(reason) });
    /** Take the documented ceiling, or a smaller positive integer the caller prefers: a caller may narrow a budget, never widen it. */
    const lowered = (value: number | undefined, documented: number): number => (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value < documented ? value : documented);
    const openDirAt = (at: number, name: string): number => openSync(procOf(at) + '/' + name, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NOCTTY | constants.O_NONBLOCK);
    /** The one component grammar the reader accepts: offering a packlist entry under any other rule would advertise a file that cannot be read back. */
    const isComponent = (value: string): boolean => value.length > 0 && value.length <= MAX_COMPONENT && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
    /** Type an untrusted child name on its own O_PATH descriptor, so nothing is read and a link is never followed. */
    const classify = (at: number, name: string): { kind: 'file'; dev: number; ino: number; size: number } | { kind: 'dir'; dev: number; ino: number } | { kind: 'link' } | { kind: 'other' } | { kind: 'error'; code: string } => {
        let fd: number = -1;
        try {
            fd = openSync(procOf(at) + '/' + name, O_PATH | constants.O_NOFOLLOW);
            const st = fstatSync(fd);
            const type = st.mode & S_IFMT;
            if (type === S_IFREG) return { kind: 'file', dev: st.dev, ino: st.ino, size: st.size };
            if (type === S_IFDIR) return { kind: 'dir', dev: st.dev, ino: st.ino };
            if (type === S_IFLNK) return { kind: 'link' };
            return { kind: 'other' };
        } catch (error) {
            return { kind: 'error', code: ioReason(error) };
        } finally {
            closeQuietly(fd);
        }
    };
    const rejectReason = (kind: string, code: string, label: string): string => kind === 'link' ? label + ' must not be a symbolic link' : kind === 'dir' ? label + ' must be a regular file, not a directory' : kind === 'other' ? label + ' must be a regular file, not a special file' : label + ' could not be opened: ' + code;
    if (typeof opts.anchorDir !== 'string' || opts.anchorDir.length === 0) return fail('anchorDir must be a trusted absolute directory');
    if (!opts.anchorDir.startsWith('/')) return fail('anchorDir must be an absolute path');
    if (opts.anchorDir.length > MAX_PATH) return fail('anchorDir is too long');
    if (opts.anchorDir.includes(String.fromCharCode(0))) return fail('anchorDir contains a NUL byte');
    if (opts.anchorDir.length > 1 && (opts.anchorDir.endsWith('/') || opts.anchorDir.includes('//'))) return fail('anchorDir must be normalized, without a trailing or doubled slash');
    for (const part of opts.anchorDir.split('/')) if (part === '.' || part === '..') return fail('anchorDir must be normalized, without . or .. components');
    if (typeof opts.packageName !== 'string' || opts.packageName.length === 0 || opts.packageName.length > NAME_MAX || !/^[a-z0-9](?:-?[a-z0-9])*$/.test(opts.packageName)) return fail('packageName must be one lowercase package directory name of at most 64 letters, digits and single hyphens');
    const action = opts.action ?? 'list';
    if (action !== 'list' && action !== 'read') return fail('action must be list or read');
    const components: string[] = [];
    if (action === 'read') {
        if (typeof opts.path !== 'string' || opts.path.length === 0) return fail('path must name one file inside the package');
        if (opts.path.length > MAX_PATH) return fail('path is too long');
        if (opts.path.includes(String.fromCharCode(0))) return fail('path contains a NUL byte');
        if (opts.path.startsWith('/')) return fail('path must be relative to the package directory');
        if (opts.path.endsWith('/')) return fail('path must name a file, not a directory');
        for (const part of opts.path.split('/')) {
            if (part === '') return fail('path must not contain an empty component');
            if (part === '.' || part === '..') return fail('path must not contain . or .. components');
            if (!isComponent(part)) return fail('path components may use only letters, digits, dot, underscore and hyphen, may not start with a dot, and are at most 255 bytes');
            components.push(part);
        }
        // The same rule the inventory walk uses: components.length - 1 directories below the package.
        if (components.length - 1 > limits.depth) return fail('path nests deeper than the ' + limits.depth + '-directory limit for packaged resources');
        if (opts.topLevel !== undefined && components[0] !== 'SKILL.md' && !opts.topLevel.includes(components[0]!)) return fail(opts.path + ' is not part of the exported skill package');
    }
    const locator: types.skills.PackageLocator = { anchorDir: opts.anchorDir, packageName: opts.packageName, components };
    const resourceLimit = lowered(opts.resourceLimit, limits.resources);
    const entryLimit = lowered(opts.entryLimit, limits.resourceEntries);
    const depthLimit = lowered(opts.depthLimit, limits.depth);
    const pageLimit = lowered(opts.pageLimit, limits.pageBytes);
    // Containment is proved by binding every open to a directory descriptor through /proc/self/fd, which only Linux
    // provides. Elsewhere the layer refuses to guess: nothing is read rather than falling back to a path-based open
    // that could follow a link out of the package.
    if (process.platform !== 'linux') return fail('bounded package access needs the Linux /proc/self/fd descriptor binding, which this platform does not provide');
    /** Result of one bounded inventory pass: what was listed, the verified total, and whether that total is proven. */
    type Inventory = {
        resources: types.skills.ResourceEntry[];
        /** Bytes of every regular file the pass could measure; only meaningful when complete. */
        total: number;
        /** True only when every entry and directory was measured, so the total is the package's real size. */
        complete: boolean;
        /** Entries deliberately left out: confirmed links, special files, unusable names and objects beyond the depth limit. */
        skipped: number;
        /** True when a count budget stopped collecting names. */
        truncated: boolean;
        /** True when an object could not be typed at all, so its size is unknown rather than excluded. */
        unmeasured: boolean;
        /** True when measured bytes already exceed the package limit, which the walk stops at. */
        overBudget: boolean;
    };
    const inventory = (packageFd: number): Inventory => {
        const resources: types.skills.ResourceEntry[] = [];
        let total = 0;
        let skipped = 0;
        let truncated = false;
        let complete = true;
        let unmeasured = false;
        let overBudget = false;
        let listed = 0;
        const walk = (dirFd: number, base: string, depth: number): void => {
            let handle: ReturnType<typeof opendirSync>;
            try {
                handle = opendirSync(procOf(dirFd));
            } catch {
                // The directory opened but would not list: its contents are unknown, not empty.
                skipped++;
                complete = false;
                unmeasured = true;
                return;
            }
            try {
                let record: ReturnType<typeof handle.readSync>;
                // An I/O failure mid-iteration is a bounded, reported stop, never a rejected promise: the names already
                // collected stay useful, but the whole-package total is no longer provable.
                while (true) {
                    try {
                        record = handle.readSync();
                    } catch {
                        complete = false;
                        unmeasured = true;
                        return;
                    }
                    if (record === null) break;
                    // A narrowed export hides every other top-level entry entirely: not listed, not counted, not readable.
                    if (!base && opts.topLevel !== undefined && record.name !== 'SKILL.md' && !opts.topLevel.includes(record.name)) continue;
                    if (listed >= entryLimit) {
                        truncated = true;
                        complete = false;
                        return;
                    }
                    listed++;
                    const rel = base ? base + '/' + record.name : record.name;
                    const at = classify(dirFd, record.name);
                    if (at.kind === 'file') {
                        total += at.size;
                        if (total > limits.packageBytes) {
                            overBudget = true;
                            complete = false;
                            return;
                        }
                        if (rel === 'SKILL.md') continue;
                        // Counted toward the total already; only its name is unusable, which does not weaken the total.
                        if (!isComponent(record.name)) {
                            skipped++;
                            continue;
                        }
                        if (resources.length >= resourceLimit) {
                            truncated = true;
                            continue;
                        }
                        resources.push({ path: rel, bytes: at.size });
                        continue;
                    }
                    // depth counts directories below the package, so a directory at the very limit may still be
                    // followed: the files inside it sit at the documented nesting depth, and the read action below
                    // applies the same rule to a composed path. Any stricter walk would hide readable resources.
                    if (at.kind === 'dir' && depth < depthLimit) {
                        if (!isComponent(record.name)) {
                            skipped++;
                            complete = false;
                            continue;
                        }
                        let child: number = -1;
                        try {
                            child = openDirAt(dirFd, record.name);
                        } catch {
                            skipped++;
                            complete = false;
                            unmeasured = true;
                            continue;
                        }
                        try {
                            walk(child, rel, depth + 1);
                        } finally {
                            closeQuietly(child);
                        }
                        continue;
                    }
                    skipped++;
                    // A confirmed link or special file is knowably not a regular data file, so it is excluded from the
                    // total on purpose. An object that could not be typed at all is different: its size is unknown, so
                    // the package total stays unproven and no partial sum may stand in for it.
                    if (at.kind === 'dir') complete = false;
                    else if (at.kind === 'error') {
                        complete = false;
                        unmeasured = true;
                    }
                }
            } finally {
                // Best-effort cleanup must preserve an incomplete inventory or the original failure.
                try { handle.closeSync(); } catch {}
            }
        };
        walk(packageFd, '', 0);
        resources.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
        return { resources, total, complete, skipped, truncated, unmeasured, overBudget };
    };
    let anchorFd: number = -1;
    try {
        anchorFd = openSync(locator.anchorDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NOCTTY | constants.O_NONBLOCK);
    } catch (error) {
        return fail('cannot open the trusted anchor: ' + ioReason(error));
    }
    try {
        const anchorIdentity = fstatSync(anchorFd);
        let packageFd: number = -1;
        try {
            packageFd = openDirAt(anchorFd, locator.packageName!);
        } catch (error) {
            return fail('cannot open package ' + locator.packageName + ': ' + ioReason(error));
        }
        try {
            const opened = fstatSync(packageFd);
            if (opened.dev !== anchorIdentity.dev || opened.ino === anchorIdentity.ino) return fail('package ' + locator.packageName + ' is not a directory inside the permitted container');
            const manifest = classify(packageFd, 'SKILL.md');
            if (manifest.kind !== 'file') return fail('package ' + locator.packageName + ' has no readable SKILL.md: ' + rejectReason(manifest.kind, manifest.kind === 'error' ? manifest.code : '', 'SKILL.md'));
            const manifestBytes = manifest.size;
            // The package budget is checked in both actions: one oversized file must not become readable merely
            // because it was opened directly instead of listed.
            const census = inventory(packageFd);
            // Over the limit is a definite refusal for both actions, distinct from a total that merely stayed unproven.
            if (census.overBudget) return fail('package ' + locator.packageName + ' holds more than the ' + limits.packageBytes + '-byte package limit and was not read');
            if (action === 'read') {
                // A page is only handed out when the package budget was actually proven: an unmeasured object or a
                // count/depth cut means the total is unknown, and returning bytes would vouch for what was never read.
                if (census.unmeasured) return fail('package ' + locator.packageName + ' contains an object whose size could not be measured, so its total is unproven and no file was returned');
                if (!census.complete) return fail('the total size of package ' + locator.packageName + ' could not be verified within the documented entry, depth and count limits, so no file was returned');
                const openedDirs: number[] = [];
                let current = packageFd;
                try {
                    for (const component of locator.components.slice(0, -1)) {
                        let next: number = -1;
                        try {
                            next = openDirAt(current, component);
                        } catch (error) {
                            return fail(component + ' could not be opened as a directory inside the package: ' + ioReason(error));
                        }
                        openedDirs.push(next);
                        current = next;
                    }
                    const target = locator.components[locator.components.length - 1]!;
                    const label = locator.components.join('/');
                    const at = classify(current, target);
                    if (at.kind !== 'file') return fail(rejectReason(at.kind, at.kind === 'error' ? at.code : '', label));
                    const ceiling = locator.components.length === 1 && target === 'SKILL.md' ? limits.instructionsBytes : limits.resourceBytes;
                    if (at.size > ceiling) return fail(label + ' is ' + at.size + ' bytes, larger than the ' + ceiling + '-byte limit for this file');
                    const offset = opts.offset ?? 0;
                    if (!Number.isInteger(offset) || offset < 0) return fail('offset must be a whole number of bytes from the start of the file');
                    if (offset > at.size) return fail('offset ' + offset + ' is past the ' + at.size + '-byte end of the file');
                    const want = Math.min(pageLimit, at.size - offset);
                    let fd: number = -1;
                    try {
                        fd = openSync(procOf(current) + '/' + target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NOCTTY | constants.O_NONBLOCK);
                        const verified = fstatSync(fd);
                        if (!verified.isFile() || verified.dev !== at.dev || verified.ino !== at.ino || verified.size !== at.size) return fail(label + ' changed while it was being opened');
                        const buffer = Buffer.alloc(want);
                        let got = 0;
                        while (got < want) {
                            const read = readSync(fd, buffer, got, want - got, offset + got);
                            if (!read) return fail(label + ' changed while it was being read');
                            got += read;
                        }
                        return {
                            ok: true,
                            action: 'read',
                            path: opts.path!,
                            bytes: buffer.subarray(0, got),
                            offset,
                            nextOffset: offset + got,
                            hasMore: offset + got < at.size,
                            total: at.size,
                        };
                    } catch (error) {
                        return fail(label + ' could not be read: ' + ioReason(error));
                    } finally {
                        closeQuietly(fd);
                    }
                } finally {
                    for (const dir of openedDirs) closeQuietly(dir);
                }
            }
            return {
                ok: true,
                action: 'list',
                resources: census.resources,
                manifestBytes,
                manifestOversized: manifestBytes > limits.instructionsBytes,
                ...(census.complete && !census.unmeasured && !census.overBudget ? { packageBytes: census.total } : {}),
                skipped: census.skipped,
                truncated: census.truncated || !census.complete || census.unmeasured,
            };
        } catch (error) {
            return fail('cannot inspect package ' + locator.packageName + ': ' + ioReason(error));
        } finally {
            closeQuietly(packageFd);
        }
    } catch (error) {
        return fail('cannot inspect the trusted anchor: ' + ioReason(error));
    } finally {
        closeQuietly(anchorFd);
    }
}
