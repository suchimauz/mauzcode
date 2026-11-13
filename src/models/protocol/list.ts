/**
 * List the closed set of shared wire protocols as id and label pairs in stable registry order.
 *
 * Use to show or validate protocol choices (for example the custom provider's protocol select); returns openai-chat, openai-responses, anthropic and gemini.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): { id: string; label: string }[] {
    return ["openai-chat", "openai-responses", "anthropic", "gemini"].map(id => {
        const { label } = ctx.fns.models.protocol.get({ id });
        return { id, label };
    });
}
