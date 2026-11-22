import { isAbsolute, relative, resolve } from "node:path";

type ProviderEntryFile = {
    kind?: string;
    name?: string;
    rel: string;
    abs: string;
    moduleDir: string;
    root?: string;
    rootDir?: string;
    mod?: { default?: unknown };
};

/** One rejected declaration: the file it came from and a fixed reason. */
type Diagnostic = { rel: string; message: string };

// Boot skips a kind whose files are all gone — exactly when the registry must empty. This opt-in makes the boot
// pass call the loader with no entries, so unloading does not wait for a restart.
export const collectEmpty = true;

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HANDLER = /^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/;
const SETTING = /^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/;
const FORBIDDEN = ["__proto__", "prototype", "constructor"];

/**
 * Registers web search provider declarations (`$websearchProvider_<id>.ts`) from mounted modules and plugins.
 *
 * A declaration names runtime handler functions of its own owner; ownership is checked here, existence at call
 * time. A broken, foreign or duplicate declaration is rejected with a fixed diagnostic (`websearch.provider.rejected`)
 * while the rest of the batch registers. Providers of unmounted owners are removed, and a full boot pass also drops
 * deleted files, so the registry follows the mounted code without a restart.
 * @param opts.entries Classified websearchProvider declarations, with mounted roots or trusted boot metadata.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Classified websearchProvider declarations, with mounted roots or trusted boot metadata. */
        entries: ProviderEntryFile[];
    },
): Promise<{ registered: string[]; rejected: Diagnostic[] }> {
    const state = (ctx.state.websearch ??= {});
    const providers = (state.providers ??= {});
    const boot = ctx.state.procs.boot.entries ?? [];
    const mounted = ctx.fns.procs.modules.list({});
    const within = (base: string, path: string) => {
        const rel = relative(resolve(base), resolve(path));
        return rel === "" || (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel));
    };
    const mountedNames = new Set(mounted.map(m => m.name));
    for (const [id, provider] of Object.entries(providers)) {
        if (!mountedNames.has(provider.owner)) delete providers[id];
    }
    // A full boot pass (every scanned declaration, or none anywhere) also drops files deleted from a still-mounted
    // owner; a partial namespace reload never prunes other owners.
    const declared = boot.filter(e => e.kind === "websearchProvider");
    const fullPass = opts.entries.length === 0
        ? declared.length === 0
        : declared.length > 0 && declared.every(e => opts.entries.some(o => o.abs === e.abs));
    if (fullPass) {
        const paths = new Set(opts.entries.map(e => e.abs));
        for (const [id, provider] of Object.entries(providers)) if (!paths.has(provider.abs)) delete providers[id];
    }

    const registered: string[] = [];
    const rejected: Diagnostic[] = [];
    for (const entry of opts.entries) {
        const reject = (message: string): void => {
            rejected.push({ rel: entry.rel, message });
            ctx.fns.procs.log.warn({ event: "websearch.provider.rejected", msg: `${entry.rel}: ${message}` });
        };
        // A declaration is untrusted code: reading it can throw. The failure stays on its file with a fixed reason.
        try {
            const id = entry.name;
            if (typeof id !== "string" || !KEBAB.test(id)) { reject("websearchProvider id must be lowercase kebab-case"); continue; }
            const source = entry.root && entry.rootDir ? entry : boot.find(e =>
                e.kind === "websearchProvider" && e.abs === entry.abs && e.name === id);
            const owner = source && typeof source.root === "string" ? mounted.find(m => m.name === source.root) : undefined;
            if (!source || !owner || typeof source.rootDir !== "string" || typeof source.abs !== "string" ||
                !within(source.rootDir, source.abs) || !within(owner.dir, source.rootDir)) {
                reject("websearchProvider requires a mounted source owner");
                continue;
            }
            let imported: { default?: unknown };
            try {
                imported = entry.mod ?? await import(entry.abs + `?t=${Date.now()}`);
            } catch {
                reject("websearchProvider declaration failed to import");
                continue;
            }
            const checked = validate(imported?.default, owner.namespaces ?? []);
            if (typeof checked === "string") { reject(checked); continue; }
            const previous = Object.hasOwn(providers, id) ? providers[id] : undefined;
            if (previous && !(previous.owner === owner.name && previous.abs === source.abs)) {
                reject(`websearchProvider ${id} already belongs to ${previous.owner} (${previous.rel})`);
                continue;
            }
            providers[id] = { id, owner: owner.name, rel: entry.rel, abs: source.abs, ...checked };
            if (!registered.includes(id)) registered.push(id);
            ctx.fns.procs.log.debug({ event: "load.websearchProvider", msg: id, from: entry.rel });
        } catch {
            reject("websearchProvider declaration failed to load");
        }
    }
    return { registered: registered.sort(), rejected };
}

// Validation runs before anything is written, so a rejected declaration never replaces a working one. Messages
// name a shape, never a value.
function validate(value: unknown, namespaces: string[]):
    Pick<types.websearch.ProviderEntry, "label" | "description" | "handlers" | "settings"> | string {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "websearchProvider must default-export a declaration object";
    const def = value as Record<string, any>;
    if (def.apiVersion !== 1) return "websearchProvider apiVersion must be 1";
    const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
    if (!text(def.label, 100)) return "websearchProvider requires a label of at most 100 characters";
    if (!text(def.description, 500)) return "websearchProvider requires a description of at most 500 characters";
    const handlers = def.handlers;
    if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) return "websearchProvider requires handlers.search";
    for (const key of Object.keys(handlers)) if (key !== "search" && key !== "status") return "websearchProvider handlers allow only search and status";
    if (typeof handlers.search !== "string") return "websearchProvider requires handlers.search";
    for (const name of [handlers.search, handlers.status]) {
        if (name === undefined) continue;
        if (typeof name !== "string" || name.length > 200 || !HANDLER.test(name) || name.split(".").some(s => FORBIDDEN.includes(s))) {
            return "websearchProvider handler must be a runtime function name <namespace>.<fn>";
        }
        if (!namespaces.includes(name.slice(0, name.lastIndexOf(".")))) return "websearchProvider handler must belong to the declaring module";
    }
    const settings = def.settings ?? [];
    if (!Array.isArray(settings) || settings.length > 20 ||
        settings.some((s: unknown) => typeof s !== "string" || s.length > 200 || !SETTING.test(s))) {
        return "websearchProvider settings must be a list of setting keys <module>.<key>";
    }
    return {
        label: def.label.trim(),
        description: def.description.trim(),
        handlers: { search: handlers.search, ...(handlers.status ? { status: handlers.status } : {}) },
        settings: [...settings],
    };
}
