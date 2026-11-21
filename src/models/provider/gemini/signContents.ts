/**
 * Add the Gemini CLI placeholder thought signature to unsigned replayed function-call turns
 *
 * Code Assist path only. For every model turn with functionCall parts where none carries a thoughtSignature (for example a transcript from another provider), sets `skip_thought_signature_validator` on the first functionCall part, as Gemini CLI does; turns that already have a signed call are left unchanged, and the other calls of a turn stay unsigned. Returns new contents; the input is not mutated.
 * @param opts.contents Gemini contents from toGeminiContents.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Gemini contents from toGeminiContents. */
        contents: Array<{ role: string; parts: Array<Record<string, any>> }>;
    },
): Array<{ role: string; parts: Array<Record<string, any>> }> {
    const k = ctx.fns.models.provider.gemini.constants({});
    return opts.contents.map(c => {
        if (c.role !== "model") return c;
        const calls = c.parts.filter(p => p && p.functionCall);
        if (!calls.length || calls.some(p => typeof p.thoughtSignature === "string" && p.thoughtSignature)) return c;
        let done = false;
        return { ...c, parts: c.parts.map(p => { if (!done && p?.functionCall) { done = true; return { ...p, thoughtSignature: k.placeholderSignature }; } return p; }) };
    });
}
