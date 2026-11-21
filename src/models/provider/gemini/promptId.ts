/**
 * Build the Code Assist user_prompt_id for a request
 *
 * Returns `<sessionId>########<n>` where n counts user turns in the transcript (tool results are not user turns), so it is stable across retries of one step and grows with each new user message, matching Gemini CLI's `<session>########<turn>` form.
 * @param opts.sessionId Request session id.
 * @param opts.messages Request transcript.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Request session id. */
        sessionId: string;
        /** Request transcript. */
        messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
    },
): string {
    const _ctx = ctx;
    const turns = opts.messages.filter(m => (m as Record<string, unknown>).role === "user").length;
    return opts.sessionId + "########" + turns;
}
