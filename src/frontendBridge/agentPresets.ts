/**
 * Read effective code-managed and custom agent presets for the React Settings tab
 *
 * Use for the read-only Settings → Agent presets tab. An authenticated owner GET returns generated built-ins and stored custom presets from the effective catalogue in menu order with its full access rules, plugin grants, excluded prompt sections and prompt text, plus the configured default identifier and whether that preset is missing. Never writes, never changes the default, and never returns agent snapshots. Unauthenticated requests get 401, non-owners 403, other methods 405 with Allow: GET; responses are uncached.
 * @param opts.req Authenticated owner GET request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authenticated owner GET request. */
        req: Request;
    },
): Promise<Response> {
    const headers = { 'Cache-Control': 'no-store', 'Vary': 'Cookie' };
    const reply = (body: object, status = 200) => Response.json(body, { status, headers });
    const user = (session as Session & { user?: { id: string; role?: string } })?.user;
    if (!user) return reply({ error: 'Unauthorized' }, 401);
    if (opts.req.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
    if (user.role !== 'owner') return reply({ error: 'Only owners can view agent presets' }, 403);
    try {
        const [rows, defaultPresetId] = await Promise.all([
            ctx.fns.agentPreset.list({}),
            ctx.fns.settings.getString({ module: 'agentPreset', scopeType: 'global', key: 'default', fallback: 'standard' }),
        ]);
        const presets = rows.map(p => ({
            id: p.id, name: p.name, description: p.description, sortOrder: p.sort_order, builtin: p.builtin,
            allow: p.allow, deny: p.deny, plugins: p.plugins, excludeSections: p.exclude_sections,
            prompt: p.prompt, updatedAt: Number(p.updated_at),
        }));
        return reply({ version: 1, presets, defaultPresetId, defaultPresetMissing: !presets.some(p => p.id === defaultPresetId) });
    } catch (error) {
        console.error('Agent presets view failed', error);
        return reply({ error: 'Could not load agent presets' }, 500);
    }
}
