/**
 * Resolves the `rtk` executable on a PATH the way a shell would, without running it.
 *
 * Use before probing or rewriting so the checked binary is the same one the effective environment would run.
 * Distinguishes a missing executable from files named `rtk` that exist but are not executable regular files.
 * @param opts.path PATH value to search (colon-separated); the server PATH when omitted.
 * @param opts.cwd Base for relative PATH entries; the server cwd when omitted.
 */
export default async function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** PATH value to search (colon-separated); the server PATH when omitted. */
        path?: string;
        /** Base for relative PATH entries; the server cwd when omitted. */
        cwd?: string;
    } = {},
): Promise<{ path: string | null; problem: 'missing' | 'permission' | null }> {
    const { access, stat } = await import('node:fs/promises');
    const { constants } = await import('node:fs');
    const { resolve } = await import('node:path');
    let denied = false;
    for (const dir of (opts.path ?? process.env.PATH ?? '').split(':')) {
        const candidate = resolve(opts.cwd ?? process.cwd(), dir || '.', 'rtk');
        const info = await stat(candidate).catch(() => null);
        if (!info || !info.isFile()) continue;
        try { await access(candidate, constants.X_OK); return { path: candidate, problem: null }; }
        catch { denied = true; }
    }
    return { path: null, problem: denied ? 'permission' : 'missing' };
}
