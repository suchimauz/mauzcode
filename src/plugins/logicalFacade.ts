/**
 * List exact core facade functions governed by a mounted plugin grant.
 *
 * Use for preset authorization and plugin discovery without changing physical registration or setting ownership.
 * @param opts.plugin Plugin identifier whose logical membership is requested.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Plugin identifier whose logical membership is requested. */
        plugin: string;
        /** Physical runtime names to include in this discovery view; never mutates the mounted module. */
        physical?: string[];
    },
): string[] {
    const facade = opts.plugin === 'websearch' ? ['websearch.search', 'websearch.providers', 'websearch.answer', 'websearch.read', 'websearch.fetch'] : [];
    return [...new Set([...(opts.physical ?? []), ...facade])];
}
