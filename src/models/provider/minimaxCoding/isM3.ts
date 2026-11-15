/**
 * Detect the MiniMax-M3 model family from a model id
 *
 * Use inside the minimax-coding provider after models.provider.minimaxCoding.isFlash: MiniMax-M3 and M3.x point releases switch thinking on or off without an effort control, while every other id (Flash itself, M2.x, unknown families) follows other rules. Matches case-insensitively on the documented prefix boundary (M3, M3.x but not M3.1-Flash or M30).
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
    return /^minimax-m3(?:\.|$)/i.test(String(opts.model));
}
