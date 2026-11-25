type WorkspaceConfig = {
    status: 'missing' | 'invalid' | 'ok';
    roots: { name: string; directory: string }[];
    enabledPluginSkills: string[];
    diagnostics: string[];
};
/**
 * Read one workspace's bounded skill configuration, with no writes or cached enablement.
 *
 * Load only .mauzcode/skills.json from the trusted workspace host. An absent or unreadable configuration does not grant any plugin skills. Invalid root declarations are isolated; an invalid plugin list grants nothing and does not discard independent roots.
 * @param opts.workspace Internal trusted workspace identity with its absolute directory and SSH alias (empty for local).
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Internal trusted workspace identity with its absolute directory and SSH alias (empty for local). */
        workspace: { host: string; dir: string };
    },
): Promise<WorkspaceConfig> {
    const limits = await ctx.fns.skills.packageLimits({});
    const diagnostics: string[] = [];
    const roots: WorkspaceConfig['roots'] = [];
    let enabledPluginSkills: string[] = [];
    const note = (reason: string): void => {
        if (diagnostics.length < limits.diagnostics) diagnostics.push(reason.slice(0, limits.diagnosticChars));
    };
    const invalid = (reason: string): WorkspaceConfig => {
        note(reason);
        return { status: 'invalid', roots: [], enabledPluginSkills: [], diagnostics };
    };
    const record = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value);
    const reply = await ctx.fns.skills.workspaceTransport({ workspace: opts.workspace, action: 'config' });
    if (!reply.ok) return invalid('skills.json: ' + reply.reason);
    if (reply.action !== 'config') return invalid('skills.json: invalid reader response');
    if (reply.text === null) return { status: 'missing', roots, enabledPluginSkills, diagnostics };
    let parsed: unknown;
    try { parsed = JSON.parse(reply.text); }
    catch { return invalid('skills.json must be valid JSON'); }
    if (!record(parsed)) return invalid('skills.json must contain a JSON object');
    if (parsed.roots !== undefined) {
        if (!record(parsed.roots)) note('skills.json roots must be an object of named workspace-relative directories');
        else {
            const entries = Object.entries(parsed.roots);
            if (entries.length > 16) note('skills.json supports at most 16 named roots; further declarations were ignored');
            for (const [index, [name, directory]] of entries.slice(0, 16).entries()) {
                const id = await ctx.fns.skills.qualifiedId({ sourceKind: 'workspace', root: name, name: 'probe' });
                if (!id.ok) { note('skills.json root entry ' + (index + 1) + ' has an invalid qualifier'); continue; }
                if (typeof directory !== 'string' || Buffer.byteLength(directory) > 1_024 ||
                    /[\\\u0000-\u001f\u007f]/.test(directory) || directory.split('/').some(part =>
                        !part || part === '.' || part === '..' || Buffer.byteLength(part) > 255 || /[\ud800-\udfff]/u.test(part))) {
                    note('skills.json root ' + name + ' must be a normalized workspace-relative directory');
                    continue;
                }
                roots.push({ name, directory });
            }
        }
    }
    if (parsed.enabledPluginSkills !== undefined) {
        const ids = parsed.enabledPluginSkills;
        if (Array.isArray(ids) && ids.length <= 128) {
            const valid: string[] = [];
            for (const id of ids) {
                if (typeof id !== 'string' || id.length > 141) break;
                const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id });
                if (!checked.ok || checked.id.sourceKind !== 'plugin') break;
                valid.push(id);
            }
            if (valid.length === ids.length) enabledPluginSkills = [...new Set(valid)];
            else note('skills.json enabledPluginSkills must contain only exact plugin skill IDs; no plugin skills enabled');
        } else note('skills.json enabledPluginSkills must be an array of at most 128 plugin skill IDs; no plugin skills enabled');
    }
    return { status: 'ok', roots, enabledPluginSkills, diagnostics };
}
