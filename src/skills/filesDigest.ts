/**
 * Compute the content digest of a staged skill package.
 *
 * sha256 over every file's path, executable bit, length and bytes in path order; the same files always give the same digest and any change gives another. Pure: no I/O.
 * @param opts.files Staged files with base64 bytes.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Staged files with base64 bytes. */
        files: types.skills.StagedFile[];
    },
): string {
    const hash = new Bun.CryptoHasher('sha256');
    for (const file of [...opts.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
        const bytes = Buffer.from(file.data, 'base64');
        hash.update(JSON.stringify([file.path, file.executable === true, bytes.length])).update(bytes);
    }
    return hash.digest('hex');
}
