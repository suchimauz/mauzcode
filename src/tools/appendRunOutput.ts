// Feed partial output into a running call so the chat can show it live.
//
// The incident had a second half: the command piped through `tail -8`, so even
// the output that did exist was buffered until the process ended. Streaming
// what the tool has produced SO FAR is the only honest answer to "is it
// alive?" — a changing last line proves progress in a way a spinner cannot.
//
// The whole output is retained (not just a tail) so a row expanded late still
// shows it from the first line, up to a per-run cap. Beyond the cap the oldest
// output is dropped and outputStart advances, so stream offsets stay valid and
// the client can say how much was dropped. Retained output lives only as long
// as the run entry: tools.endRun releases it, and the complete output becomes
// the stored tool result.
const MAX_RETAINED = 16 * 1024 * 1024;

/**
 * Appends streamed output to a running tool call's retained live output.
 *
 * Use from a long-running tool that produces incremental stdout or stderr so the chat shows live progress; beyond a per-run cap (16 Mi characters) the oldest output is dropped.
 * @param opts.id Execution id returned by tools.beginRun.
 * @param opts.chunk Newly produced output text to append.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Execution id returned by tools.beginRun. */
        id: string;
        /** Newly produced output text to append. */
        chunk: string;
    },
): { appended: boolean } {
    const registry: Map<string, types.tools.ToolRun> = ((ctx.state as any).toolRuns ??= new Map());
    const run = registry.get(opts.id);
    if (!run || !opts.chunk) return { appended: false };
    run.output += String(opts.chunk);
    if (run.output.length > MAX_RETAINED) {
        const drop = run.output.length - MAX_RETAINED;
        run.output = run.output.slice(drop);
        run.outputStart += drop;
    }
    return { appended: true };
}
