const LIMIT = 6_000;
// Largest read_result output: 16000 text units plus JSON envelope and escaping headroom.
const READ_RESULT_LIMIT = 40_000;
// Largest read_skill output: one 64 KiB text page plus the resource listing and envelope.
const READ_SKILL_LIMIT = 160_000;

/** Keep small tool outputs inline and store larger outputs as immutable result files.
 * Returns bounded transcript content and, only after a successful write, its structured
 * reference. Callers must persist result_ref alongside content so readResult can authorize
 * retrieval. Storage failures return an explicit unavailable notice without a reference.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Agent that owns the tool output and the stored result file. */
        agent: types.agent.Agent;
        /** Complete tool output; outputs up to 6000 JavaScript characters remain inline. */
        output: string;
        /** Tool name; bash previews retain the tail, other tools retain the head. */
        kind: string;
    },
): Promise<{ content: string; result_ref?: types.agent.ResultRef }> {
    const { agent, kind } = opts;
    const output = String(opts.output ?? "");
    if (output.length <= LIMIT) return { content: output };
    // A read_result range is already bounded (16000 units plus a small envelope);
    // storing it again would only produce another preview that needs another read.
    if (isReadResult(ctx, kind) && output.length <= READ_RESULT_LIMIT) return { content: output };
    // read_skill is paged by skills.read (one 64 KiB page plus a bounded listing); stashing it would hide the
    // instructions the model asked for behind another read.
    if (isNative(ctx, kind, "tools.readSkill") && output.length <= READ_SKILL_LIMIT) return { content: output };

    const fromTail = kind === "bash";
    const { preview: cut, ref: result_ref, storageError } = await ctx.fns.resultStore.prepare({ownerAgentId:agent.id,kind,text:output,inlineLimit:LIMIT,tail:fromTail});
    const label = `${fromTail ? "tail" : "head"} preview of ${output.length} characters`;
    // A read result's first line is its readId; whichever end the preview keeps,
    // the receipt stays visible so the agent can still edit without rereading.
    const receiptLine = ["read", "edit", "write"].includes(kind) ? /^readId: [^\n]{1,200}$/m.exec(output.slice(0, 2000))?.[0] : undefined;
    const preview = receiptLine && !cut.includes(receiptLine) ? `${receiptLine}\n…\n${cut}` : cut;
    if (!result_ref) {
        const reason = storageError ?? "unavailable";
        const note = `[${label} — result storage failed: ${reason}. Full output was NOT saved; no retrieval reference is available.]`;
        return { content: fromTail ? `${note}\n${preview}` : `${preview}\n${note}` };
    }
    const nativeRead = typeof ctx.fns.agent?.wireTools === "function" && ctx.fns.agent.wireTools({ agent }).some(tool => isReadResult(ctx, tool.name));
    const note = nativeRead
        ? `[${label} — full output saved. Read a bounded range with read_result: ` +
          `{ "id": ${JSON.stringify(result_ref.id)}, "offset": 0, "limit": 4000 }]`
        : `[${label} — full output saved. Read a bounded range with eval: ` +
          `await ctx.fns.agent.readResult({ id: ${JSON.stringify(result_ref.id)}, offset: 0, limit: 4000 })]`;
    return { content: fromTail ? `${note}\n${preview}` : `${preview}\n${note}`, result_ref };
}

// The native read tool, matched by its declared implementation so a renamed
// or disambiguated wire name still counts.
function isReadResult(ctx: Context, name: string): boolean {
    return isNative(ctx, name, "tools.readResult");
}

function isNative(ctx: Context, name: string, fn: string): boolean {
    return typeof ctx.fns.tools?.list === "function" && ctx.fns.tools.list({}).some(tool => (tool.wireName === name || tool.name === name) && tool.fn === fn);
}
