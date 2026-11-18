/**
 * Validate provider connection configuration before saving or network access.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider configuration to validate. */
        config: types.models.ResolvedConnection["config"];
    },
): void {
    const { config } = opts;
    if (config.clientVersion !== undefined && config.clientVersion !== "") {
        if (typeof config.clientVersion !== "string" || !/^[0-9A-Za-z.+-]{1,40}$/.test(config.clientVersion)) throw new Error("Client version must look like 2.0.0");
        if (config.detectCliVersion === true) throw new Error("Claude client version override cannot be combined with CLI version detection");
    }
}
