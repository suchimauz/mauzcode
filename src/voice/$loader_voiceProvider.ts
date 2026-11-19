import { isAbsolute, relative, resolve } from "node:path";

type ProviderEntry = {
    kind?: string;
    name?: string;
    rel: string;
    abs: string;
    moduleDir: string;
    root?: string;
    rootDir?: string;
    mod?: { default?: unknown };
};

/** One rejected declaration: the file it came from and a fixed, credential-free reason. */
type Diagnostic = { rel: string; message: string };

// Boot skips a kind whose files are all gone — exactly when the registry must empty. This opt-in
// makes the boot pass call the loader with no entries, so unloading does not wait for a restart.
export const collectEmpty = true;

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const FIELD_KEYS = ["__proto__", "constructor", "prototype"];
const FIELD_TYPES = ["text", "url", "select", "secret", "number", "boolean"];
const CAPABILITIES = ["turnDetection", "sampleRates", "languages", "keywords", "prompt", "delay"];
const TRANSPORTS = ["direct", "socks", "ssh-tunnel"];
const OPTION_FLAGS = ["languages", "keywords", "prompt", "delay"] as const;

/**
 * Register voice provider declarations from mounted sources, isolating a bad declaration from good ones.
 *
 * Declarations follow their owner: unmounting a plugin drops its providers now rather than at the next restart,
 * and a full boot pass also drops files deleted from a still-mounted owner. A declaration that fails validation
 * or claims an id another declaration already owns is rejected with a diagnostic while every other declaration
 * in the same batch still registers, so one broken plugin cannot empty the picker.
 * @param opts.entries Classified voiceProvider declarations, with mounted roots or trusted boot metadata.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: { entries: ProviderEntry[] },
): Promise<{ registered: string[]; rejected: Diagnostic[] }> {
    const state = (ctx.state.voice ??= {});
    const providers = (state.providers ??= {});
    const boot = ctx.state.procs.boot.entries ?? [];
    const mounted = ctx.fns.procs.modules.list({});
    const within = (base: string, path: string) => {
        const rel = relative(resolve(base), resolve(path));
        return rel === "" || (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel));
    };
    // Unmounting a plugin reruns boot without its files, so its declarations must
    // leave the registry now rather than at the next restart.
    const mountedNames = new Set(mounted.map(m => m.name));
    for (const [id, provider] of Object.entries(providers)) {
        if (!mountedNames.has(provider.owner)) delete providers[id];
    }
    // A full boot pass (every scanned declaration) also drops files deleted from a
    // still-mounted owner — including the last one: an empty batch with nothing declared anywhere
    // is a full pass too, so the registry empties now. A partial namespace reload always passes at
    // least one file and never prunes other owners, and a batch that lost files to a failed import
    // keeps the last working registration.
    const declared = boot.filter(e => e.kind === "voiceProvider");
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
            ctx.fns.procs.log.warn({ event: "voice.provider.rejected", msg: `${entry.rel}: ${message}` });
        };
        // A declaration is untrusted code: reading it can throw (a getter, a Proxy trap, a failed
        // import). The failure stays on its file — a fixed reason, never the thrown text — and the
        // rest of the batch still registers.
        try {
            const id = entry.name;
            if (typeof id !== "string" || !KEBAB.test(id)) { reject("voiceProvider id must be lowercase kebab-case"); continue; }
            const source = entry.root && entry.rootDir ? entry : boot.find(e =>
                e.kind === "voiceProvider" && e.abs === entry.abs && e.name === id);
            if (!source || typeof source.root !== "string" || typeof source.rootDir !== "string" || typeof source.abs !== "string" ||
                !within(source.rootDir, source.abs) || !mounted.some(m => m.name === source.root && within(m.dir, source.rootDir))) {
                reject("voiceProvider requires a mounted source owner");
                continue;
            }
            const owner = source.root;
            let imported: { default?: unknown };
            try {
                imported = entry.mod ?? await import(entry.abs + `?t=${Date.now()}`);
            } catch {
                reject("voiceProvider declaration failed to import");
                continue;
            }
            const problem = validate(id, imported?.default);
            if (problem) { reject(problem); continue; }
            const previous = Object.hasOwn(providers, id) ? providers[id] : undefined;
            if (previous && !(previous.owner === owner && previous.abs === source.abs)) {
                reject(`voiceProvider ${id} already belongs to ${previous.owner} (${previous.rel})`);
                continue;
            }
            providers[id] = {
                owner,
                module: entry.moduleDir === "." ? "app" : entry.moduleDir,
                rel: entry.rel,
                abs: source.abs,
                // The explicit assertion follows runtime validation; imported declarations are not trusted TS.
                definition: imported!.default as types.voice.ProviderDefinition,
            };
            if (!registered.includes(id)) registered.push(id);
            ctx.fns.procs.log.debug({ event: "load.voiceProvider", msg: id, from: entry.rel });
        } catch {
            reject("voiceProvider declaration failed to load");
        }
    }
    return { registered: registered.sort(), rejected };
}

// Validation runs before anything is written to the registry, so a rejected declaration never replaces a working
// one. Every message names a shape, never a value: field values and secrets must not reach a log or an error.
function validate(id: string, value: unknown): string | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "voiceProvider must default-export a definition object";
    const def = value as Record<string, any>;
    if (def.id !== id) return "voiceProvider definition id must match its filename";
    if (typeof def.label !== "string" || !def.label.trim()) return "voiceProvider requires a nonblank label";
    if (def.description !== undefined && typeof def.description !== "string") return "voiceProvider description must be a string";
    const destination = def.destination;
    if (!destination || typeof destination !== "object" || Array.isArray(destination) ||
        (destination.kind !== "cloud" && destination.kind !== "host") ||
        typeof destination.label !== "string" || !destination.label.trim()) {
        return "voiceProvider requires a destination with a cloud or host kind and a nonblank label";
    }
    if (typeof def.test !== "function") return "voiceProvider requires a test operation";
    if (typeof def.open !== "function") return "voiceProvider requires an open operation";
    const fieldProblem = validateFields(def.fields);
    if (fieldProblem) return fieldProblem;
    if (def.transports !== undefined) {
        const kinds = def.transports;
        if (!Array.isArray(kinds) || !kinds.length || new Set(kinds).size !== kinds.length ||
            kinds.some((kind: unknown) => !TRANSPORTS.includes(kind as string))) {
            return "voiceProvider transports must be a nonempty list of distinct direct, socks or ssh-tunnel kinds";
        }
    }
    if (def.validateConfig !== undefined && typeof def.validateConfig !== "function") return "voiceProvider validateConfig must be a function";
    if (def.destinationFor !== undefined && typeof def.destinationFor !== "function") return "voiceProvider destinationFor must be a function";
    if (def.listModels !== undefined && typeof def.listModels !== "function") return "voiceProvider listModels must be a function";
    if (def.models !== undefined && !Array.isArray(def.models)) return "voiceProvider models must be a list";
    // A provider with neither a catalogue nor discovery has no selectable model, so it is a declaration bug.
    if (def.models === undefined && def.listModels === undefined) return "voiceProvider requires a model list or a models operation";
    const ids = new Set<string>();
    for (const model of def.models ?? []) {
        if (!model || typeof model !== "object" || Array.isArray(model)) return "voiceProvider model must be an object";
        if (typeof model.id !== "string" || !model.id.trim() || model.id.length > 200) return "voiceProvider model requires a nonblank id";
        if (ids.has(model.id)) return "voiceProvider model ids must be unique";
        ids.add(model.id);
        if (model.label !== undefined && typeof model.label !== "string") return "voiceProvider model label must be a string";
        if (model.description !== undefined && typeof model.description !== "string") return "voiceProvider model description must be a string";
        const capabilities = model.capabilities;
        if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) return "voiceProvider model requires capabilities";
        const unknown = Object.keys(capabilities).filter(key => !CAPABILITIES.includes(key));
        if (unknown.length) return "voiceProvider model capabilities must be known flags";
        if (capabilities.turnDetection !== "client" && capabilities.turnDetection !== "server") {
            return "voiceProvider model turnDetection must be client or server";
        }
        const rates = capabilities.sampleRates;
        if (!Array.isArray(rates) || !rates.length || rates.some((rate: unknown) => typeof rate !== "number" || !Number.isInteger(rate) || rate <= 0) ||
            new Set(rates).size !== rates.length) return "voiceProvider model requires unique positive integer sample rates";
        for (const flag of OPTION_FLAGS) {
            if (capabilities[flag] !== undefined && typeof capabilities[flag] !== "boolean") {
                return `voiceProvider model ${flag} capability must be boolean`;
            }
        }
    }
    return null;
}

function validateFields(fields: unknown): string | null {
    if (!Array.isArray(fields)) return "voiceProvider requires a field schema";
    const keys = new Set<string>();
    for (const field of fields as Record<string, any>[]) {
        if (!field || typeof field !== "object" || Array.isArray(field)) return "voiceProvider field must be an object";
        if (typeof field.key !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(field.key) || keys.has(field.key) || FIELD_KEYS.includes(field.key)) {
            return "voiceProvider field keys must be safe and unique";
        }
        keys.add(field.key);
        if (typeof field.label !== "string" || !field.label.trim() || !FIELD_TYPES.includes(field.type)) {
            return "voiceProvider field requires a label and supported type";
        }
        if (field.required !== undefined && typeof field.required !== "boolean") return "voiceProvider field required must be boolean";
        for (const key of ["help", "placeholder"] as const) {
            if (field[key] !== undefined && typeof field[key] !== "string") return `voiceProvider field ${key} must be a string`;
        }
        if (field.type === "secret" && Object.hasOwn(field, "default")) return "voiceProvider secret fields must not declare defaults";
        if (field.type === "select") {
            if (!Array.isArray(field.options) || !field.options.length ||
                field.options.some((o: any) => !o || typeof o.value !== "string" || typeof o.label !== "string") ||
                new Set(field.options.map((o: any) => o.value)).size !== field.options.length) {
                return "voiceProvider select field requires unique value/label options";
            }
            if (field.default !== undefined && !field.options.some((o: any) => o.value === field.default)) {
                return "voiceProvider select default must match an option";
            }
        }
        if (field.default !== undefined) {
            const expected = field.type === "number" ? "number" : field.type === "boolean" ? "boolean" : "string";
            if (typeof field.default !== expected || (typeof field.default === "number" && !Number.isFinite(field.default))) {
                return "voiceProvider field default must match its type";
            }
        }
    }
    return null;
}
