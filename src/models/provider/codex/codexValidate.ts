/**
 * Validate provider connection configuration before saving or network access.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider configuration to validate. */
        config: types.models.ResolvedConnection["config"];
    },
): void {
    const _ctx = ctx;
    const { config } = opts;
    
    
            if (config.clientVersion !== undefined && config.clientVersion !== "" && !/^[0-9A-Za-z.+-]{1,40}$/.test(String(config.clientVersion))) throw new Error("Client version must look like 0.98.0");
}
