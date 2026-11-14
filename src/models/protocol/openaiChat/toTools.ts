/**
 * Convert neutral tools into nested Chat Completions function tools
 *
 * Use for OpenAI Chat Completions requests. Strict decoding is enabled only when every nested object already satisfies strict schema requirements; optional fields disable it.
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
    return opts.tools.map(({name,description,parameters}) => ({type:'function',function:{name,description,parameters,strict:ctx.fns.models.protocol.common.isStrictTool({schema:parameters})}}));
}
