/**
 * Report whether a Coding Plan model id belongs to the GLM-5.3 family
 *
 * Use inside the zai-coding provider where the vendor's Chat Completions quirks apply: only `glm-5.3`, `glm-5.3-flash` and `glm-5.3-flashx` take the explicit `thinking` switch, accept the low/high/max reasoning levels and require assistant reasoning to be replayed on tool-call turns. Exact matching, so a newer or unrelated id never inherits the behavior by prefix.
 * @param opts.model Coding Plan model id.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Coding Plan model id. */
        model: string;
    },
): boolean {
    const _ctx = ctx;
    return /^glm-5\.3(?:-flashx?)?$/.test(opts.model);
}
