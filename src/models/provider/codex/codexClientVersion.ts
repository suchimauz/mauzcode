/** Resolve the Codex request identity and its safe, owner-visible source. */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Non-secret connection configuration. */
        config: types.models.ResolvedConnection["config"];
        /** Refresh local detection when enabled and no override is present. */
        refresh?: boolean;
    },
): Promise<{ version: string; source: "override" | "detected" | "default"; detail?: string }> {
    const fallback = "0.157.1";
    const override = typeof opts.config.clientVersion === "string" ? opts.config.clientVersion.trim() : "";
    if (override && /^[0-9A-Za-z.+-]{1,40}$/.test(override)) return { version: override, source: "override" };
    if (opts.config.detectCliVersion === true) {
        const version = await ctx.fns.models.provider.codex.codexCliVersion({ refresh: opts.refresh });
        if (version) {
            const parts = version.split(".").map(Number);
            const base = fallback.split(".").map(Number);
            const different = parts.findIndex((part, i) => part !== base[i]);
            const older = different >= 0 && parts[different]! < base[different]!;
            return { version, source: "detected", ...(older ? { detail: `Detected CLI is older than SDK default ${fallback}` } : {}) };
        }
    }
    return { version: fallback, source: "default" };
}
