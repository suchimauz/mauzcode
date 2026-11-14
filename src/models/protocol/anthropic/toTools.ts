/**
 * Convert neutral tools into Anthropic input schema declarations
 *
 * Use when building an Anthropic Messages request from provider-neutral ToolSpec definitions. Keeps the argument schema intact and introduces no OpenAI wrapper.
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
    return opts.tools.map(({name,description,parameters}) => ({name,description,input_schema:parameters}));
}
