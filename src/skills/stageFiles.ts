type StageResult = { ok: true; name: string; files: types.skills.StagedFile[] } | { ok: false; reason: string };
/**
 * Validate a candidate skill package held in memory before it can be staged for review.
 *
 * Requires a valid SKILL.md whose name matches the package, safe package-relative paths, and the documented file count, file size and package size limits. An invalid or oversized package is refused, never truncated. Pure validation: no I/O.
 * @param opts.files Candidate files with base64 bytes.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Candidate files with base64 bytes. */
        files: types.skills.StagedFile[];
    },
): Promise<StageResult> {
    const limits = await ctx.fns.skills.packageLimits({});
    const fail = (reason: string): StageResult => ({ ok: false, reason });
    const component = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
    const seen = new Set<string>();
    let total = 0;
    if (!Array.isArray(opts.files) || opts.files.length === 0) return fail('the package has no files');
    if (opts.files.length > limits.resources + 1) return fail(`the package has more than ${limits.resources} resources`);
    for (const file of opts.files) {
        const parts = typeof file.path === 'string' ? file.path.split('/') : [];
        if (!parts.length || parts.some(part => !component.test(part) || Buffer.byteLength(part) > 255) || parts.length - 1 > limits.depth) return fail('unsafe package path ' + String(file.path).slice(0, 120));
        if (seen.has(file.path)) return fail('duplicate package path ' + file.path);
        for (let i = 1; i < parts.length; i++) if (seen.has(parts.slice(0, i).join('/'))) return fail(file.path + ' is inside a file');
        seen.add(file.path);
        const bytes = Buffer.from(file.data, 'base64');
        const ceiling = file.path === 'SKILL.md' ? limits.instructionsBytes : limits.resourceBytes;
        if (bytes.length > ceiling) return fail(`${file.path} is larger than the ${ceiling}-byte limit`);
        total += bytes.length;
    }
    if (total > limits.packageBytes) return fail(`the package is larger than the ${limits.packageBytes}-byte limit`);
    const manifest = opts.files.find(file => file.path === 'SKILL.md');
    if (!manifest) return fail('the package has no SKILL.md at its root');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(manifest.data, 'base64')); }
    catch { return fail('SKILL.md is not UTF-8 text'); }
    const parsed = await ctx.fns.skills.parseManifest({ text });
    if (!parsed.ok) return fail(parsed.reason);
    return { ok: true, name: parsed.manifest.name, files: [...opts.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) };
}
