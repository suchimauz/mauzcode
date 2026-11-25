import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// mauzcode: package data must not enter the runtime registry, even at bootstrap.
/**
 * Separates skill package data from executable runtime paths.
 *
 * With no source roots, blocks files and directories in the reserved .mauzcode/skills tree, including aliases to it. With source roots, checks a candidate data root for overlap without changing any runtime mounts. The caller still validates workspace containment and package reads.
 * @param opts.path Absolute local path to check as runtime input or as a candidate data directory.
 * @param opts.allowMissing Allow missing components below a resolvable ancestor for creating or removing a runtime file; broken links are never accepted. @default false
 * @param opts.sourceRoots Absolute local runtime source directories. Supplying this list selects the data-root overlap check.
 * @param opts.workspaceDir Absolute workspace directory that permits its default .mauzcode/skills subtree, only if the subtree has not been redirected outside that location.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Absolute local path to check as runtime input or as a candidate data directory. */
        path: string;
        /** Allow missing components below a resolvable ancestor for creating or removing a runtime file; broken links are never accepted. @default false */
        allowMissing?: boolean;
        /** Absolute local runtime source directories. Supplying this list selects the data-root overlap check. */
        sourceRoots?: string[];
        /** Absolute workspace directory that permits its default .mauzcode/skills subtree, only if the subtree has not been redirected outside that location. */
        workspaceDir?: string;
    },
): { blocked: boolean; canonical: string | null } {
    // Resolve afresh: an editor can replace a symlink between two scans.
    // For a new or removed file, resolve the nearest existing ancestor; do not
    // mistake a dangling link (or an inaccessible component) for an absent file.
    const canonicalPath = (path: string, allowMissing: boolean): string | null => {
        if (!isAbsolute(path)) return null;
        const missing: string[] = [];
        let current = resolve(path);
        for (;;) {
            try { return join(realpathSync(current), ...missing); }
            catch (error) {
                if (!allowMissing || (error as NodeJS.ErrnoException).code !== "ENOENT") return null;
            }
            try { lstatSync(current); return null; }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null; }
            const parent = dirname(current);
            if (parent === current) return null;
            missing.unshift(relative(parent, current));
            current = parent;
        }
    };
    const reserved = (path: string): boolean => {
        const parts = path.split(sep);
        return parts.some((part, i) => part === ".mauzcode" && parts[i + 1] === "skills");
    };
    const path = resolve(opts.path);
    if (!isAbsolute(opts.path)) return { blocked: true, canonical: null };
    if (!opts.sourceRoots && reserved(path)) return { blocked: true, canonical: null };
    const canonical = canonicalPath(path, opts.allowMissing === true);
    if (canonical === null) return { blocked: true, canonical };
    if (!opts.sourceRoots) return { blocked: reserved(canonical), canonical };

    const contains = (parent: string, child: string): boolean => {
        const rel = relative(parent, child);
        return rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
    };
    const overlap = (a: string, b: string): boolean => contains(a, b) || contains(b, a);
    // Do not bless an alias out of the reserved subtree (e.g. into src/skills).
    if (opts.workspaceDir && isAbsolute(opts.workspaceDir)) {
        const workspace = canonicalPath(opts.workspaceDir, false);
        if (workspace !== null && contains(join(opts.workspaceDir, ".mauzcode", "skills"), path) &&
            contains(join(workspace, ".mauzcode", "skills"), canonical)) return { blocked: false, canonical };
    }
    for (const root of opts.sourceRoots) {
        const actual = canonicalPath(root, true);
        if (actual === null || overlap(resolve(root), path) || overlap(actual, canonical)) return { blocked: true, canonical };
    }
    return { blocked: false, canonical };
}
