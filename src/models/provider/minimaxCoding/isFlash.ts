/**
 * Detect the MiniMax-M3.1-Flash model family from a model id
 *
 * Use inside the minimax-coding provider wherever MiniMax family rules differ (service tier, reasoning profile). Matches case-insensitively on the documented prefix: Flash models always think, reject thinking disabled and accept the admission tier never. Everything the M Plan lists that is not Flash and not MiniMax-M3 (for example M2.x) has no documented controls.
 * @param opts.model Provider-native model id.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-native model id. */
        model: string;
    },
): boolean {
    const _ctx = ctx;
    return /^minimax-m3\.1-flash/i.test(String(opts.model));
}
