type ManifestResult = { ok: true; manifest: types.skills.Manifest; body: string } | { ok: false; reason: string };
/**
 * Validate one Agent Skills SKILL.md document into its manifest and literal body.
 *
 * Parse only the initial YAML frontmatter and preserve portable fields and the original Markdown body. Report invalid fields and directory-name mismatches for this package without reading files or affecting its neighbours.
 * @param opts.text UTF-8 contents of one SKILL.md file, frontmatter plus Markdown body.
 * @param opts.directoryName Package directory name to compare with the manifest name verbatim; omit when checking a document with no filesystem context.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** UTF-8 contents of one SKILL.md file, frontmatter plus Markdown body. */
        text: string;
        /** Package directory name to compare with the manifest name verbatim; omit when checking a document with no filesystem context. */
        directoryName?: string;
    },
): Promise<ManifestResult> {
    const NAME_MAX = 64;
    const DESCRIPTION_MAX = 1024;
    const COMPATIBILITY_MAX = 500;
    const KNOWN_FIELDS = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];
    const isName = (value: string): boolean => /^[a-z0-9](?:-?[a-z0-9])*$/.test(value) && value.length <= NAME_MAX;
    const fail = (reason: string): ManifestResult => ({ ok: false, reason: `package ${opts.directoryName ?? 'skill'}: ${reason}` });
    const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(opts.text);
    if (!match) return fail('SKILL.md must begin with the opening --- line of its YAML frontmatter');
    let header: unknown;
    try {
        header = Bun.YAML.parse(match[1]!);
    } catch (error) {
        return fail('malformed YAML frontmatter: ' + (error instanceof Error ? error.message : String(error)).slice(0, 200));
    }
    if (header === null || header === undefined) return fail('empty YAML frontmatter');
    if (typeof header !== 'object' || Array.isArray(header)) return fail('expected a YAML mapping in the frontmatter');
    const fields = header as Record<string, unknown>;
    const reasons: string[] = [];
    const unknownFields = Object.keys(fields).filter(key => !KNOWN_FIELDS.includes(key));
    if (unknownFields.length) reasons.push('unknown frontmatter field(s): ' + unknownFields.slice(0, 5).join(', ') + (unknownFields.length > 5 ? ' +' + (unknownFields.length - 5) : ''));
    const manifest: types.skills.Manifest = { name: '', description: '' };
    const name = fields.name;
    if (typeof name !== 'string') reasons.push('name must be a string');
    else if (name.length > NAME_MAX) reasons.push('name must be at most 64 characters');
    else if (!isName(name)) reasons.push('name must use lowercase letters, digits and single hyphens, without a leading, trailing or doubled hyphen');
    else if (opts.directoryName !== undefined && name !== opts.directoryName) reasons.push('name does not match the package directory name');
    else manifest.name = name;
    const description = fields.description;
    if (typeof description !== 'string' || description.trim().length === 0) reasons.push('description is required and must state what the skill does');
    else if (description.length > DESCRIPTION_MAX) reasons.push('description must be at most 1024 characters');
    else manifest.description = description;
    const license = fields.license;
    if (license !== undefined) {
        if (typeof license !== 'string') reasons.push('license must be a string when present');
        else manifest.license = license;
    }
    const compatibility = fields.compatibility;
    if (compatibility !== undefined) {
        if (typeof compatibility !== 'string') reasons.push('compatibility must be a string when present');
        else if (!compatibility.length || compatibility.length > COMPATIBILITY_MAX) reasons.push('compatibility must be 1 to 500 characters');
        else manifest.compatibility = compatibility;
    }
    const metadata = fields.metadata;
    if (metadata !== undefined) {
        if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) reasons.push('metadata must be a flat string map when present');
        else {
            const entries: Record<string, string> = Object.create(null);
            for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
                if (typeof value !== 'string') reasons.push('metadata.' + key + ' must be a string');
                else entries[key] = value;
            }
            manifest.metadata = entries;
        }
    }
    const allowedTools = fields['allowed-tools'];
    if (allowedTools !== undefined) {
        if (typeof allowedTools !== 'string') reasons.push('allowed-tools must be a string when present');
        else manifest['allowed-tools'] = allowedTools;
    }
    if (reasons.length) return fail(reasons.join('; '));
    return { ok: true, manifest, body: match[2]! };
}
