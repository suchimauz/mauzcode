// Resolves the allowed values of a declared `enum` setting. A descriptor may name `optionsFrom`, a runtime
// function of its OWN module that returns the values (for example registered provider ids); everything that
// lists or validates enum settings goes through here so the UI, agents and instance files share one rule.
const MAX_OPTIONS = 200;
const MAX_LENGTH = 100;
const TIMEOUT_MS = 1000;

/**
 * Returns the allowed values of a declared enum setting, resolving its optional `optionsFrom` function.
 *
 * Use it wherever enum options are shown or checked. `optionsFrom` must name a function of the module that
 * declares the setting; it is called with `{}` only, bounded to 1 second, and must return at most 200 non-empty
 * strings of at most 100 characters. A missing, foreign, slow, failing or invalid function falls back to the
 * static `options` (empty when none); a foreign one is logged as `settings.optionsFrom.rejected`.
 * @param opts.module Module that declares the setting.
 * @param opts.key Setting key within the module.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Module that declares the setting. */
        module: string;
        /** Setting key within the module. */
        key: string;
    },
): Promise<{ options: string[]; dynamic: boolean }> {
    const registry = (ctx.state as any).settings?.registry as Map<string, any> | undefined;
    const descriptor = registry?.get(`${opts.module}.${opts.key}`);
    const fallback = Array.isArray(descriptor?.options) ? descriptor.options.filter((o: unknown) => typeof o === "string") as string[] : [];
    const source = descriptor?.optionsFrom;
    if (!descriptor || descriptor.type !== "enum" || source === undefined) return { options: fallback, dynamic: false };
    const name = typeof source === "string" ? source : "";
    const dot = name.lastIndexOf(".");
    if (dot <= 0 || name.slice(0, dot) !== opts.module || !/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/.test(name)
        || name.split(".").some(s => ["__proto__", "prototype", "constructor"].includes(s))) {
        ctx.fns.procs.log.warn({ event: "settings.optionsFrom.rejected", msg: `${opts.module}.${opts.key}: optionsFrom must name a function of module ${opts.module}` });
        return { options: fallback, dynamic: false };
    }
    const fn = name.split(".").reduce((node: any, part) => node?.[part], ctx.fns as any);
    if (typeof fn !== "function") return { options: fallback, dynamic: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const value: unknown = await Promise.race([
            Promise.resolve().then(() => fn({})),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS); }),
        ]);
        if (!Array.isArray(value) || value.length > MAX_OPTIONS
            || value.some(v => typeof v !== "string" || !v.trim() || v.length > MAX_LENGTH)) return { options: fallback, dynamic: false };
        return { options: [...new Set(value as string[])], dynamic: true };
    } catch {
        return { options: fallback, dynamic: false };
    } finally {
        clearTimeout(timer);
    }
}
