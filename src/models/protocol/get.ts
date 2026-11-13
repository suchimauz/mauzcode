/**
 * Look up one shared wire protocol strategy by id.
 *
 * Use whenever a provider needs discovery or a probe for a configured protocol id; this registry is the only place mapping ids to implementations, so callers never branch on the id. Throws "Unsupported protocol" for ids outside the closed set without making any request.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Protocol id: `openai-chat`, `openai-responses`, `anthropic` or `gemini`. */
        id: string;
    },
): types.models.Protocol {
    const registry: Record<string, () => types.models.Protocol> = {
        "openai-chat": () => ctx.fns.models.protocol.openaiChat.definition({}),
        "openai-responses": () => ctx.fns.models.protocol.openaiResponses.definition({}),
        anthropic: () => ctx.fns.models.protocol.anthropic.definition({}),
        gemini: () => ctx.fns.models.protocol.gemini.definition({}),
    };
    const make = Object.hasOwn(registry, String(opts.id)) ? registry[String(opts.id)] : undefined;
    if (!make) throw new Error("Unsupported protocol");
    return make();
}
