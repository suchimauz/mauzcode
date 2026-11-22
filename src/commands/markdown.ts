/** Decode one command's YAML metadata and literal prompt body without executing either. */
export default function (_ctx: Context, _session: Session | null, opts: {/** UTF-8 command file. */ text: string}): Record<string, unknown> {
    const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(opts.text);
    if (!match) throw new Error('Expected command YAML frontmatter');
    const header = Bun.YAML.parse(match[1]!);
    if (!header || typeof header !== 'object' || Array.isArray(header)) throw new Error('Expected a command metadata object');
    return {kind:'prompt', ...header, template:match[2]!};
}
