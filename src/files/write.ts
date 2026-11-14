import { mkdir, open, rename, rm, chmod, stat, lstat, realpath, readlink, rmdir, writeFile } from "node:fs/promises";
import { dirname, basename, join, resolve } from "node:path";
import { homedir, hostname } from "node:os";
import { randomBytes } from "node:crypto";

/**
 * Writes text to a local or remote file atomically under a per-file lock, with optional version, content or absence preconditions.
 *
 * Every MauzCode writer goes through here. Locally: an in-process queue plus an exclusive lock directory under ~/.mauzcode/locks/<sha256(real path)> (MAUZCODE_LOCKS_DIR overrides), bounded waiting, precondition check inside the lock, temp file in the same directory, mode kept, fsync, rename; symlinks are written through. With host the same contract runs over SSH via remote.writeFile. A refused write throws an Error whose fields files.refusalOf reads (code conflict or busy) and leaves the file untouched. The lock only coordinates MauzCode writers: bash, direct fs calls and editors do not take it.
 * @param opts.host Remote SSH host alias from ~/.ssh/config (see remote.servers); omitted means the local workspace.
 * @param opts.path Workspace-relative or absolute path; with host a remote path relative to the remote home.
 * @param opts.content Full file body written verbatim.
 * @param opts.expectedContent Expected current text; the write is refused with conflict when the file differs.
 * @param opts.expectedVersion Expected sha256 hex of the current raw bytes; the write is refused with conflict when it differs or the file is missing.
 * @param opts.ifAbsent Refuse with conflict when the file already exists. @default false
 * @param opts.lockWaitMs How long to wait for another writer's lock before reporting busy. @default 5000 @minimum 0
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Remote SSH host alias from ~/.ssh/config (see remote.servers); omitted means local. */
        host?: string;
        /** Workspace-relative path, or remote path when host is set. */
        path: string;
        /** Full file body written verbatim. */
        content: string;
        /** Expected current text; the write is refused with conflict when the file differs. */
        expectedContent?: string;
        /** Expected sha256 hex of the current raw bytes; refused with conflict when it differs or the file is missing. */
        expectedVersion?: string;
        /** Refuse with conflict when the file already exists. @default false */
        ifAbsent?: boolean;
        /** How long to wait for another writer's lock before reporting busy. @default 5000 @minimum 0 */
        lockWaitMs?: number;
    },
): Promise<{ bytes: number; version: string }> {
    if (opts.host) {
        return await ctx.fns.remote.writeFile({
            host: opts.host, path: opts.path, content: opts.content,
            expectedContent: opts.expectedContent, expectedVersion: opts.expectedVersion, ifAbsent: opts.ifAbsent,
        });
    }
    const abs = ctx.fns.files.resolveSafe({ path: opts.path });
    // Write through a symlink to its target, as remote.writeFile does.
    let target = abs;
    const link = await lstat(abs).catch(() => null);
    if (link?.isSymbolicLink()) target = await realpath(abs).catch(async () => resolve(dirname(abs), await readlink(abs)));
    const dir = dirname(target);
    await mkdir(dir, { recursive: true });
    const real = join(await realpath(dir), basename(target));

    const data = Buffer.from(opts.content, "utf8");
    const version = new Bun.CryptoHasher("sha256").update(data).digest("hex");

    // In-process: chain on the file so writers in this process wait their turn
    // without polling. Cross-process: the lock directory.
    const st = ((ctx.state as any).files ??= {}) as types.files.State;
    const queue = (st.writeQueue ??= new Map());
    const prev = queue.get(real) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>(r => { release = r; });
    const tail = prev.then(() => mine);
    queue.set(real, tail);
    await prev;
    try {
        const locks = String(ctx.env.MAUZCODE_LOCKS_DIR ?? "").trim() || join(homedir(), ".mauzcode", "locks");
        await mkdir(locks, { recursive: true });
        const lockPath = join(locks, new Bun.CryptoHasher("sha256").update(real).digest("hex"));
        const wait = Math.max(0, opts.lockWaitMs ?? 5000);
        const deadline = Date.now() + wait;
        for (;;) {
            try { await mkdir(lockPath); break; }
            catch (e: any) {
                if (e?.code !== "EEXIST") throw e;
                if (Date.now() >= deadline) {
                    const owner = await Bun.file(join(lockPath, "owner")).text().catch(() => "");
                    throw ctx.fns.files.refusal({ code: "busy", lockPath, owner: owner.trim(), target: real });
                }
                await Bun.sleep(25);
            }
        }
        try {
            await writeFile(join(lockPath, "owner"), `pid=${process.pid} host=${hostname()} started=${new Date().toISOString()} file=${real}\n`).catch(() => {});
            const cur = await stat(real).catch(() => null);
            if (opts.ifAbsent && cur) throw ctx.fns.files.refusal({ code: "conflict", reason: "exists", target: real });
            if (opts.expectedVersion != null || opts.expectedContent != null) {
                if (!cur) throw ctx.fns.files.refusal({ code: "conflict", reason: "absent", target: real });
                const bytes = new Uint8Array(await Bun.file(real).arrayBuffer());
                if (opts.expectedVersion != null && new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== opts.expectedVersion) {
                    throw ctx.fns.files.refusal({ code: "conflict", reason: "changed", target: real });
                }
                if (opts.expectedContent != null && new TextDecoder().decode(bytes) !== opts.expectedContent) {
                    throw ctx.fns.files.refusal({ code: "conflict", reason: "changed", target: real });
                }
            }
            const tmp = join(dirname(real), `.mauzcode-write.${randomBytes(6).toString("hex")}`);
            try {
                const fh = await open(tmp, "wx", 0o600);
                try {
                    await fh.writeFile(data);
                    await fh.sync();
                } finally { await fh.close(); }
                await chmod(tmp, cur ? cur.mode & 0o7777 : 0o644);
                await rename(tmp, real);
            } catch (e) {
                await rm(tmp, { force: true }).catch(() => {});
                throw e;
            }
        } finally {
            await rm(join(lockPath, "owner"), { force: true }).catch(() => {});
            await rmdir(lockPath).catch(() => {});
        }
    } finally {
        release();
        if (queue.get(real) === tail) queue.delete(real);
    }
    return { bytes: data.length, version };
}
