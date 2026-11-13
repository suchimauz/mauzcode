/**
 * Validate provider connection configuration before saving or network access.
 *
 * Use from custom provider adapters or protocol procedures; preserves existing wire behavior.
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
    
    
            let url: URL;
            try { url = new URL(String(config.baseUrl)); }
            catch { throw new Error("API base URL must be an absolute HTTP(S) URL"); }
            if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || String(config.baseUrl).includes("?") || String(config.baseUrl).includes("#")) {
                throw new Error("API base URL must be HTTP(S), without credentials, query or fragment");
            }
}
