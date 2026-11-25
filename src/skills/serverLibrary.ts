type ServerLibraryResult =
    | { ok: true; dir: string; globalDir: string; projectDir: string; projectId: string }
    | { ok: false; reason: string };
/**
 * Locate the installation-owned server skill library and the branches visible to one workspace.
 *
 * The library lives on the MauzCode server, outside every runtime source tree: MAUZCODE_SKILLS_DIR when set, otherwise ~/.mauzcode/skill-libraries/<installation-key>/, keyed by the normalized installation workdir. The project branch uses projects.identity for the workspace host and absolute directory, so a renamed SSH alias is a new project. Pure lookup: nothing is created or read.
 * @param opts.workspace Internal trusted workspace identity with its absolute directory and SSH alias (empty for local).
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Internal trusted workspace identity with its absolute directory and SSH alias (empty for local). */
        workspace: { host: string; dir: string };
    },
): Promise<ServerLibraryResult> {
    const { homedir } = await import('node:os');
    const { isAbsolute, join, normalize } = await import('node:path');
    const fail = (reason: string): ServerLibraryResult => ({ ok: false, reason });
    const override = String(ctx.env.MAUZCODE_SKILLS_DIR ?? '').trim();
    let dir: string;
    if (override) {
        if (!isAbsolute(override) || override.includes('\0')) return fail('MAUZCODE_SKILLS_DIR must be an absolute directory');
        dir = normalize(override).replace(/\/+$/, '') || '/';
    } else {
        const workdir = normalize(ctx.fns.procs.project.workdir({})).replace(/\/+$/, '') || '/';
        const key = new Bun.CryptoHasher('sha256').update(workdir).digest('hex').slice(0, 24);
        const home = String(ctx.env.HOME ?? '').trim() || homedir();
        if (!isAbsolute(home)) return fail('cannot locate the server home directory');
        dir = join(home, '.mauzcode', 'skill-libraries', key);
    }
    if (dir === '/' || dir.split('/').some(part => part === '.' || part === '..')) return fail('the server skill library must be a normalized directory');
    const sourceRoots = ctx.fns.procs.modules.list({}).map(module => module.dir);
    sourceRoots.push(ctx.fns.procs.project.projectRoot({}));
    const checked = ctx.fns.procs.project.skillData({ path: dir, sourceRoots, allowMissing: true });
    if (checked.blocked || checked.canonical === null) return fail('the server skill library overlaps a runtime source tree or cannot be verified');
    let projectId: string;
    try { projectId = (await ctx.fns.projects.identity({ dir: opts.workspace.dir, host: opts.workspace.host })).id; }
    catch { return fail('expected a trusted absolute workspace identity'); }
    if (!/^p_[0-9a-f]{64}$/.test(projectId)) return fail('unexpected project identity');
    const canonical = checked.canonical;
    return { ok: true, dir: canonical, globalDir: join(canonical, 'global'), projectDir: join(canonical, 'projects', projectId), projectId };
}
