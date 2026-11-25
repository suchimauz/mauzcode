type InventoryResult = {
    /** Every package in the catalogue, including plugin exports this workspace has not enabled; metadata only. */
    skills: { id: string; name: string; description: string; source: string; enabled: boolean }[];
    /** Server project branches of this installation, with the host and path recorded when the branch was first saved. */
    projects: { projectId: string; host: string | null; dir: string | null; current: boolean; orphaned: boolean; packages: string[] }[];
    /** Bounded diagnostics from the sources. */
    diagnostics: string[];
};
/**
 * Administrative skills inventory for the built-in Creator: disabled exports and orphaned server project branches.
 *
 * Lists IDs, names, descriptions, sources and enablement for configuring enabledPluginSkills, plus every server project branch with its recorded host and path; a branch is orphaned when its project file is missing or names an SSH alias that is no longer configured. Never returns instructions or resources and never makes a disabled skill usable. Denied to every agent that is not a genuine built-in Creator, including custom presets that grant everything.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {} = {},
): Promise<InventoryResult> {
    const { lstatSync, readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const agent = session?.agent;
    if (!agent?.id || !await ctx.fns.skills.isCreator({ agent })) throw new Error('skills.inventory is available only to the built-in Creator');
    const workspace = { host: agent.workspaceHost ?? '', dir: agent.workspaceDir };
    const catalogue = await ctx.fns.skills.catalogue({ workspace });
    const skills = catalogue.entries.map(entry => ({
        id: entry.descriptor.id, name: entry.descriptor.name, description: entry.descriptor.description,
        source: entry.descriptor.sourceLabel, enabled: entry.enabled,
    }));
    const library = await ctx.fns.skills.serverLibrary({ workspace });
    const projects: InventoryResult['projects'] = [];
    const diagnostics = [...catalogue.diagnostics];
    if (library.ok) {
        const root = join(library.dir, 'projects');
        let names: string[] = [];
        try { names = readdirSync(root).filter(name => /^p_[0-9a-f]{64}$/.test(name)).sort().slice(0, 500); } catch {}
        const aliases = new Set((await ctx.fns.remote.servers({}).catch(() => [])).map(server => server.name));
        for (const projectId of names) {
            const branch = join(root, projectId);
            try { if (!lstatSync(branch).isDirectory()) continue; } catch { continue; }
            let host: string | null = null;
            let dir: string | null = null;
            try {
                const file = join(branch, 'project.json');
                if (lstatSync(file).isFile() && lstatSync(file).size <= 8_192) {
                    const recorded = JSON.parse(readFileSync(file, 'utf8')) as { host?: unknown; dir?: unknown };
                    if (typeof recorded.host === 'string') host = recorded.host;
                    if (typeof recorded.dir === 'string') dir = recorded.dir;
                }
            } catch {}
            let packages: string[] = [];
            try { packages = readdirSync(branch, { withFileTypes: true }).filter(e => e.isDirectory() && /^[a-z0-9](?:-?[a-z0-9])*$/.test(e.name)).map(e => e.name).sort().slice(0, 100); } catch {}
            const current = projectId === library.projectId;
            const orphaned = !current && (dir === null || (host !== null && host !== '' && !aliases.has(host)));
            projects.push({ projectId, host, dir, current, orphaned, packages });
        }
    } else diagnostics.push('server library: ' + library.reason);
    return { skills, projects, diagnostics };
}
