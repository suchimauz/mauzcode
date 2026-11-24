type QualifiedIdResult = { ok: true; id: types.skills.Descriptor } | { ok: false; reason: string };
/**
 * Build or check the qualified identity of one Agent Skills package.
 *
 * Build an exact ID and source label from a package name and its declared origin, or decode a canonical ID into the same public descriptor. Reject ambiguous origins instead of normalizing them; no package location or contents are exposed.
 * @param opts.action Build the canonical ID from validated parts or check a candidate string. @default "build"
 * @param opts.sourceKind Origin family the package was discovered in: workspace, serverProject, serverGlobal or plugin.
 * @param opts.name Upstream short name from a validated manifest, 1 to 64 lowercase letters, digits and single hyphens.
 * @param opts.root Single namespace segment naming a declared workspace root other than the default one; only for workspace packages.
 * @param opts.plugin Single namespace segment identifying the mounted plugin that declares the export; only for plugin packages.
 * @param opts.pluginLabel Trusted plugin display name; omit to use the module registry’s default label.
 * @param opts.description Skill description to carry into the descriptor; omit when only identity is being resolved.
 * @param opts.id Candidate qualified ID to check, e.g. skill.plugin.git:review; required by the check action.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Build the canonical ID from validated parts or check a candidate string. @default "build" */
        action?: 'build' | 'check';
        /** Origin family the package was discovered in: workspace, serverProject, serverGlobal or plugin. */
        sourceKind?: 'workspace' | 'serverProject' | 'serverGlobal' | 'plugin';
        /** Upstream short name from a validated manifest, 1 to 64 lowercase letters, digits and single hyphens. */
        name?: string;
        /** Single namespace segment naming a declared workspace root other than the default one; only for workspace packages. */
        root?: string;
        /** Single namespace segment identifying the mounted plugin that declares the export; only for plugin packages. */
        plugin?: string;
        /** Trusted plugin display name; omit to use the module registry’s default label. */
        pluginLabel?: string;
        /** Skill description to carry into the descriptor; omit when only identity is being resolved. */
        description?: string;
        /** Candidate qualified ID to check, e.g. skill.plugin.git:review; required by the check action. */
        id?: string;
    },
): Promise<QualifiedIdResult> {
    const NAME_MAX = 64;
    const SEGMENT_MAX = 64;
    const isName = (value: string): boolean => /^[a-z0-9](?:-?[a-z0-9])*$/.test(value) && value.length <= NAME_MAX;
    const isSegment = (value: string): boolean => /^[a-z0-9](?:-?[a-z0-9])*$/.test(value) && value.length <= SEGMENT_MAX;
    const fail = (reason: string): QualifiedIdResult => ({ ok: false, reason });
    const withDescription = (id: types.skills.Descriptor): QualifiedIdResult => {
        if (opts.pluginLabel !== undefined && (id.sourceKind !== 'plugin' || typeof opts.pluginLabel !== 'string' || !opts.pluginLabel.trim())) return fail('pluginLabel requires a plugin origin and a non-blank label');
        if (id.sourceKind === 'plugin') id.sourceLabel = opts.pluginLabel?.trim() ?? id.qualifier!.slice(0, 1).toUpperCase() + id.qualifier!.slice(1);
        if (opts.description === undefined) return { ok: true, id };
        if (typeof opts.description !== 'string' || opts.description.trim().length === 0) return fail('description must be a non-blank string when supplied');
        return { ok: true, id: { ...id, description: opts.description } };
    };
    const action = opts.action ?? 'build';
    if (action !== 'build' && action !== 'check') return fail('action must be build or check');
    if (action === 'check') {
        if ([opts.sourceKind, opts.name, opts.root, opts.plugin].some(value => value !== undefined)) return fail('check accepts an exact ID, not structured origin fields');
        const candidate = opts.id;
        if (typeof candidate !== 'string' || candidate.length === 0) return fail('id is required to check a qualified skill ID');
        if (!candidate.startsWith('skill.')) return fail('a qualified skill ID starts with skill.');
        if (candidate.includes('/') || candidate.includes('\\')) return fail('a qualified skill ID uses dots and one colon, never a path separator');
        const head = candidate.slice('skill.'.length);
        const colon = head.indexOf(':');
        if (colon < 0) return fail('a qualified skill ID separates its origin from the short name with one colon');
        if (head.indexOf(':', colon + 1) >= 0) return fail('a qualified skill ID contains exactly one colon');
        const origin = head.slice(0, colon);
        const name = head.slice(colon + 1);
        if (!isName(name)) return fail('the short name must be 1 to 64 lowercase letters, digits and single hyphens, without a leading, trailing or doubled hyphen');
        const id = candidate;
        if (origin === 'workspace') return withDescription({ id, name, description: '', sourceKind: 'workspace', sourceLabel: 'Workspace' });
        if (origin.startsWith('workspace.')) {
            const root = origin.slice('workspace.'.length);
            if (!isSegment(root)) return fail('the workspace root qualifier must be one non-empty lowercase segment of letters, digits and single hyphens');
            return withDescription({ id, name, description: '', sourceKind: 'workspace', sourceLabel: `Workspace · ${root}`, qualifier: root });
        }
        if (origin === 'server.project') return withDescription({ id, name, description: '', sourceKind: 'serverProject', sourceLabel: 'Server · project' });
        if (origin === 'server.global') return withDescription({ id, name, description: '', sourceKind: 'serverGlobal', sourceLabel: 'Server · global' });
        if (origin.startsWith('plugin.')) {
            const plugin = origin.slice('plugin.'.length);
            if (!isSegment(plugin)) return fail('the plugin qualifier must be one non-empty lowercase segment of letters, digits and single hyphens');
            return withDescription({ id, name, description: '', sourceKind: 'plugin', sourceLabel: '', qualifier: plugin });
        }
        return fail('unknown skill origin ' + origin + ': only workspace, workspace.<root>, server.project, server.global and plugin.<plugin> are defined');
    }
    const sourceKind = opts.sourceKind;
    if (opts.id !== undefined || (opts.root !== undefined && sourceKind !== 'workspace') || (opts.plugin !== undefined && sourceKind !== 'plugin')) return fail('conflicting qualified ID or origin fields');
    if (sourceKind !== 'workspace' && sourceKind !== 'serverProject' && sourceKind !== 'serverGlobal' && sourceKind !== 'plugin') {
        return fail('sourceKind must be workspace, serverProject, serverGlobal or plugin');
    }
    const name = opts.name;
    if (typeof name !== 'string' || !isName(name)) return fail('name must be 1 to 64 lowercase letters, digits and single hyphens, without a leading, trailing or doubled hyphen');
    if (sourceKind === 'workspace') {
        if (opts.root !== undefined) {
            const root = opts.root;
            if (typeof root !== 'string' || !isSegment(root)) return fail('root must be one non-empty lowercase segment of letters, digits and single hyphens, without a leading, trailing or doubled hyphen');
            return withDescription({ id: `skill.workspace.${root}:${name}`, name, description: '', sourceKind, sourceLabel: `Workspace · ${root}`, qualifier: root });
        }
        return withDescription({ id: `skill.workspace:${name}`, name, description: '', sourceKind, sourceLabel: 'Workspace' });
    }
    if (sourceKind === 'serverProject') return withDescription({ id: `skill.server.project:${name}`, name, description: '', sourceKind, sourceLabel: 'Server · project' });
    if (sourceKind === 'serverGlobal') return withDescription({ id: `skill.server.global:${name}`, name, description: '', sourceKind, sourceLabel: 'Server · global' });
    const plugin = opts.plugin;
    if (typeof plugin !== 'string' || !isSegment(plugin)) return fail('plugin must be one non-empty lowercase segment of letters, digits and single hyphens, without a leading, trailing or doubled hyphen');
    return withDescription({ id: `skill.plugin.${plugin}:${name}`, name, description: '', sourceKind, sourceLabel: '', qualifier: plugin });
}
