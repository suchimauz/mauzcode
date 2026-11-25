/**
 * Native `read_skill` adapter: read an Agent Skill's instructions or one resource through skills.read.
 *
 * Binds the invoking agent from the trusted tool invocation, so authorization, continuations and
 * results are identical to a direct skills.read call. Formats instructions and text pages as model
 * text and returns images as attachments, like `read`. Rejects unknown arguments.
 * @param opts.id Exact skill ID from the available skills list.
 * @param opts.path Package-relative resource such as references/checklist.md; omit to read the instructions.
 * @param opts.continuation Opaque token from the previous page of the same path.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact skill ID from the available skills list. */
        id: string;
        /** Package-relative resource such as references/checklist.md; omit to read the instructions. */
        path?: string;
        /** Opaque token from the previous page of the same path. */
        continuation?: string;
    },
): Promise<{ output: string; content?: types.tools.Content[] }> {
    const unknown = Object.keys(opts ?? {}).filter(key => !['id', 'path', 'continuation'].includes(key));
    if (unknown.length) throw new Error('read_skill: unknown argument ' + unknown.join(', '));
    if (!session?.agent?.id) throw new Error('read_skill: requires a trusted agent invocation');
    const result = await ctx.fns.skills.read({ id: opts.id, path: opts.path, continuation: opts.continuation });
    const more = (token: string | undefined, path: string) => token
        ? `\n\n[more: read_skill({"id":${JSON.stringify(result.id)},"path":${JSON.stringify(path)},"continuation":${JSON.stringify(token)}})]`
        : '';
    if (result.kind === 'skill') {
        const meta = Object.entries(result.frontmatter).filter(([key]) => key !== 'name' && key !== 'description')
            .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
        const resources = result.resources.length
            ? result.resources.map(resource => `- ${resource.path} (${resource.bytes} bytes${resource.executable ? ', executable' : ''})`).join('\n') + (result.resourcesTruncated ? '\n- … listing truncated' : '')
            : '(none)';
        return { output: [
            `<skill id="${result.id}" source="${result.source}" revision="${result.revision}">`,
            `name: ${result.name}`, `description: ${result.frontmatter.description}`, ...meta,
            `directory: ${result.directory ?? '(not available on the workspace host)'}`,
            '', result.instructions.trimEnd(), '', 'Resources:', resources, '</skill>',
        ].join('\n') + more(result.continuation, 'SKILL.md') };
    }
    if (result.kind === 'text') {
        return { output: `<skill-resource id="${result.id}" path="${result.path}" bytes="${result.offset}-${result.nextOffset} of ${result.total}">\n${result.text}\n</skill-resource>` + more(result.continuation, result.path) };
    }
    if (result.kind === 'image') {
        return { output: `[image: ${result.id} ${result.path}]`, content: [{ type: 'image', data: result.data, mimeType: result.mimeType }] };
    }
    return { output: `[binary: ${result.id} ${result.path}, ${result.bytes} bytes${result.file ? ' at ' + result.file : ''}]` };
}
