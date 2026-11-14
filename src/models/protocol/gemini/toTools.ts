/**
 * Convert neutral tools into Gemini function declarations
 *
 * Use for Gemini generation requests. Groups the neutral names, descriptions and parameter schemas in the protocol functionDeclarations wrapper without changing the argument schema.
 * @param opts.tools Neutral tool definitions to advertise in the request.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Neutral tool definitions to advertise in the request. */
        tools: types.models.ToolSpec[];
    },
): Record<string, unknown>[] {
    return opts.tools.length ? [{functionDeclarations:opts.tools.map(({name,description,parameters})=>({name,description,parameters}))}] : [];
}
