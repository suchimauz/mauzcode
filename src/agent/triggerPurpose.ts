/**
 * Derive the short display purpose of a trigger from its prompt
 *
 * Returns the first non-empty prompt line, whitespace-collapsed and truncated to 120 characters with an ellipsis. Display text only: never stored, never derived from predicate configuration.
 * @param opts.prompt Trigger prompt text.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trigger prompt text. */
        prompt: string;
    },
): string {
    const line = String(opts.prompt ?? '').split(/\r?\n/).map(part => part.replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
    const chars = [...line];
    return chars.length > 120 ? chars.slice(0, 119).join('').trimEnd() + '…' : line;
}
