/**
 * Return the documented MiniMax reasoning profile for a model
 *
 * Versioned SDK profile minimax-2026-11, from the MiniMax Anthropic-compatibility documentation: MiniMax-M3.1-Flash always thinks and takes effort levels low..xhigh under its native names (auto sends nothing so MiniMax applies its own default, and because supported has no off a requested off applies the nearest level low); MiniMax-M3 and M3.x point releases only switch thinking on or off, so supported is off and high with off the default and no effort value; every other family (M2.x, unknown) gets null so inference streams without a reasoning setting instead of guessing. thinking disabled is never part of any profile because MiniMax rejects it (Flash answers HTTP 400 code 2013).
 * @param opts.model Provider-native model id.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-native model id. */
        model: string;
    },
): types.models.ReasoningCapabilities | null {
    const _ctx = ctx;
    const profile = "minimax-2026-11";
    if (ctx.fns.models.provider.minimaxCoding.isFlash({ model: opts.model }))
        return { supported: ["low", "medium", "high", "xhigh"], adaptive: true, source: "profile", profile };
    if (ctx.fns.models.provider.minimaxCoding.isM3({ model: opts.model }))
        return { supported: ["off", "high"], default: "off", adaptive: true, effort: false, source: "profile", profile };
    return null;
}
