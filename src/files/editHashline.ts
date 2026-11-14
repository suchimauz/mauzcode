// Parse the hashline edit DSL (`@<path>` plus anchor ops) and apply it through
// files.applyEdits — the same atomic, locked, EOL-preserving engine as `edit`.
/**
 * Parses the hashline edit DSL (`@<path>` plus anchor ops) and applies it atomically under the file lock, preserving line endings.
 *
 * Use from scripts that hold a DSL edit script; agents should prefer the edit tool with a readId.
 * @param opts.input Edit script: first non-blank line `@<path>`, then anchor ops with `|`-prefixed payload lines.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: { /** Edit script: first non-blank line `@<path>`, then anchor ops with `|`-prefixed payload lines. */ input: string },
): Promise<{ path: string; bytes: number; diff: string; content: string; version: string }> {
    const parsed = ctx.fns.files.parseHashlineEdit({ input: opts.input });
    const r = await ctx.fns.files.applyEdits({ path: parsed.path, ops: parsed.ops });
    return { path: r.path, bytes: r.bytes, diff: r.diff, content: r.content, version: r.version };
}
