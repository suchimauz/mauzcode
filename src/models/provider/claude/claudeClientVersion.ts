/** Resolve the effective Claude version and safe source metadata for reports and wire headers. */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: { conn: types.models.ResolvedConnection; refresh?: boolean },
): Promise<{ version: string; source: "override" | "detected" | "fallback"; detail?: string }> {
    const { config } = opts.conn;
    ctx.fns.models.provider.claude.claudeValidate({ config });
    if (typeof config.clientVersion === "string" && config.clientVersion) return { version: config.clientVersion, source: "override" };
    if (config.detectCliVersion === false) return { version: "2.1.260", source: "fallback" };
    // Always detect on the MauzCode host, regardless of the connection transport.
    const result = await ctx.fns.models.provider.claude.claudeCliVersionDetection({ refresh: opts.refresh });
    return { version: result.value, source: result.detected ? "detected" : "fallback" };
}
