type PluginSourceResult =
    | { ok: true; action: 'scan'; packages: (types.skills.PackageEntry & { plugin: string })[]; diagnostics: string[]; truncated: boolean }
    | types.skills.FilesResult;
/**
 * Scan the skill packages that mounted plugins explicitly export, or access one exact plugin skill.
 *
 * Only directories listed in a mounted plugin's package.json procs.skills array are exports; a root SKILL.md alone is plugin documentation, not an export. "." exports the plugin root narrowed to SKILL.md, references/, scripts/, assets/ and license files, never src/, node_modules or credentials. Exports overlapping the plugin's runtime source are refused. The mounted registry is read on every call, so a reload or unmount takes effect at once. This adapter applies no workspace enablement or preset grant.
 * @param opts.action Scan all exports, list one package's resources, or read one bounded resource page. @default scan
 * @param opts.id Exact plugin skill ID for list or read; no short-name lookups or source substitution.
 * @param opts.path Package-relative file for the read action.
 * @param opts.offset Byte offset for the read action; use the preceding page's nextOffset to continue. @default 0 @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Scan all exports, list one package's resources, or read one bounded resource page. @default scan */
        action?: 'scan' | 'list' | 'read';
        /** Exact plugin skill ID for list or read; no short-name lookups or source substitution. */
        id?: string;
        /** Package-relative file for the read action. */
        path?: string;
        /** Byte offset for the read action; use the preceding page's nextOffset to continue. @default 0 @minimum 0 */
        offset?: number;
    },
): Promise<PluginSourceResult> {
    const { lstatSync, readFileSync, realpathSync } = await import('node:fs');
    const { basename, dirname, isAbsolute, join, relative, resolve, sep } = await import('node:path');
    const action = opts.action ?? 'scan';
    const fail = (reason: string): PluginSourceResult => ({ ok: false, reason });
    if (action !== 'scan' && action !== 'list' && action !== 'read') return fail('unknown plugin skill action');
    const limits = await ctx.fns.skills.packageLimits({});
    const ROOT_ENTRIES = ['references', 'scripts', 'assets', 'LICENSE', 'LICENSE.md', 'LICENSE.txt'];
    const MAX_EXPORTS = 32;
    const MANIFEST_BYTES = 262_144;
    const diagnostics: string[] = [];
    let truncated = false;
    const note = (reason: string): void => {
        if (diagnostics.length < limits.diagnostics) diagnostics.push(reason.slice(0, limits.diagnosticChars));
        else truncated = true;
    };
    const inside = (parent: string, child: string): boolean => {
        const rel = relative(parent, child);
        return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
    };
    type Export = { plugin: string; label: string; anchorDir: string; packageName: string; topLevel?: string[] };
    /** Resolve the declared exports of one mounted plugin; malformed declarations are diagnosed and skipped. */
    const exportsOf = (module: ReturnType<typeof ctx.fns.procs.modules.list>[number]): Export[] => {
        const plugin = module.name;
        const label = module.label;
        if (!/^[a-z0-9](?:-?[a-z0-9])*$/.test(plugin) || plugin.length > 64) return [];
        let manifest: any;
        try {
            const file = join(module.dir, 'package.json');
            if (!lstatSync(file).isFile() || lstatSync(file).size > MANIFEST_BYTES) return [];
            manifest = JSON.parse(readFileSync(file, 'utf8'));
        } catch { return []; }
        const declared = manifest?.procs?.skills;
        if (declared === undefined) return [];
        if (!Array.isArray(declared) || declared.length > MAX_EXPORTS || declared.some(entry => typeof entry !== 'string')) {
            note('plugin ' + plugin + ': procs.skills must be an array of at most ' + MAX_EXPORTS + ' relative directories');
            return [];
        }
        let folder: string;
        try { folder = realpathSync(module.dir); } catch { note('plugin ' + plugin + ': cannot resolve the plugin directory'); return []; }
        const source = resolve(folder, typeof manifest.procs.src === 'string' ? manifest.procs.src : 'src');
        const reserved = [source, join(folder, 'node_modules'), join(folder, '.git')];
        const out: Export[] = [];
        for (const entry of new Set(declared as string[])) {
            if (entry !== '.' && (entry.startsWith('/') || entry.endsWith('/') || entry.split('/').some(part => !part || part === '.' || part === '..') || /[\\\u0000-\u001f]/.test(entry))) {
                note('plugin ' + plugin + ': export ' + entry.slice(0, 80) + ' must be a normalized relative directory');
                continue;
            }
            if (entry === '.') { out.push({ plugin, label, anchorDir: dirname(folder), packageName: basename(folder), topLevel: ROOT_ENTRIES }); continue; }
            const lexical = join(folder, entry);
            let actual: string;
            try { actual = realpathSync(lexical); } catch { note('plugin ' + plugin + ': export ' + entry + ' is not a readable directory'); continue; }
            if (actual !== lexical || !inside(folder, actual)) { note('plugin ' + plugin + ': export ' + entry + ' must not pass through a link'); continue; }
            if (reserved.some(dir => inside(dir, actual) || inside(actual, dir))) { note('plugin ' + plugin + ': export ' + entry + ' overlaps runtime source'); continue; }
            out.push({ plugin, label, anchorDir: dirname(actual), packageName: basename(actual) });
        }
        return out;
    };
    const mounted = ctx.fns.procs.modules.list({}).filter(module => module.plugin === true);
    if (action !== 'scan') {
        const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id: opts.id });
        if (!checked.ok || checked.id.sourceKind !== 'plugin') return fail('expected an exact plugin skill ID');
        const module = mounted.find(candidate => candidate.name === checked.id.qualifier);
        if (!module) return fail('plugin skill ' + checked.id.id + ' is not available');
        // Resolve the ID through the same scan that publishes it, so a duplicate stays unreadable until disambiguated.
        const matches: Export[] = [];
        for (const item of exportsOf(module)) {
            const scan = await ctx.fns.skills.packageScan({ anchorDir: item.anchorDir, sourceKind: 'plugin', plugin: item.plugin, pluginLabel: item.label, only: item.packageName });
            if (scan.ok && scan.packages.some(entry => entry.descriptor.id === checked.id.id)) matches.push(item);
        }
        if (matches.length !== 1) return fail(matches.length === 0 ? 'plugin skill ' + checked.id.id + ' is not available' : 'plugin skill ' + checked.id.id + ' is exported more than once');
        const item = matches[0]!;
        return ctx.fns.skills.packageFiles({ anchorDir: item.anchorDir, packageName: item.packageName, action, path: opts.path, offset: opts.offset, topLevel: item.topLevel });
    }
    const packages: (types.skills.PackageEntry & { plugin: string })[] = [];
    for (const module of mounted) {
        for (const item of exportsOf(module)) {
            if (packages.length >= limits.packages) { truncated = true; break; }
            const scan = await ctx.fns.skills.packageScan({ anchorDir: item.anchorDir, sourceKind: 'plugin', plugin: item.plugin, pluginLabel: item.label, only: item.packageName });
            if (!scan.ok) { note('plugin ' + item.plugin + ': ' + scan.reason); continue; }
            if (scan.packages.length === 0 && scan.diagnostics.length === 0) note('plugin ' + item.plugin + ': export ' + item.packageName + ' has no package');
            for (const reason of scan.diagnostics) note('plugin ' + item.plugin + ': ' + reason);
            for (const entry of scan.packages) packages.push({ ...entry, plugin: item.plugin });
        }
    }
    return { ok: true, action, packages, diagnostics, truncated };
}
