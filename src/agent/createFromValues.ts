import { resolve } from 'node:path';

/** Create an independent agent from shared creation-form fields after validating its workspace or visible project. * @param opts.title Human-readable agent title.
 * @param opts.projectId Visible project whose stored directory and SSH alias override submitted workspace fields.
 * @param opts.workspaceDir Workspace directory assigned to the agent.
 * @param opts.createWorkspaceDir Whether to create a missing workspace directory.
 * @param opts.model Model identifier to use.
 * @param opts.systemPrompt Additional system instructions.
 * @param opts.presetId Stored agent preset for the new session; omitted uses the configured default, unknown returns an error without creating.
*/
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Visible project whose authoritative directory and host are used; no agent is created if it is inaccessible. */
projectId?: string;
        /** Human-readable title. */
title?: string;
        /** Workspace dir used by the operation. */
workspaceDir?: string;
        /** Create workspace dir used by the operation. */
createWorkspaceDir?: string;
        /** Model identifier. */
model?: string;
        /** Additional system instructions. */
systemPrompt?: string;
        /** Stored agent preset identifier; omitted uses the configured default. An unknown identifier returns an error and creates nothing. */
presetId?: string }): Promise<{ agent?: any; confirmation?: { dir: string; values: Record<string, any> }; error?: string }> {
    const requestedWorkspace = String(opts.workspaceDir ?? '');
    try {
        const project = opts.projectId ? await ctx.fns.projects.get({ projectId: opts.projectId }) : null;
        if (opts.projectId && !project) return { error: 'Project not found' };
        const workspaceDir = project ? project.dir : await ctx.fns.workspace.normalize({ dir: requestedWorkspace, create: opts.createWorkspaceDir === '1' });
        const model = (await ctx.fns.models.resolveRoute({ route: String(opts.model ?? '').trim() || await ctx.fns.settings.modelDefault({}) })).route;
        const systemPrompt = String(opts.systemPrompt ?? '').trim();
        // agent.start resolves the configured default itself; resolve here only an explicit choice.
        const preset = opts.presetId === undefined ? undefined : await ctx.fns.agentPreset.resolve({ id: opts.presetId });
        const created = await ctx.fns.agent.start({ model, title: String(opts.title ?? '').trim().slice(0, 120), workspaceDir, workspaceHost: project?.host || '', systemPrompt, ...(preset ? { preset } : {}) });
        await ctx.fns.procs.db.run({ sql: "INSERT INTO kv (key, value) VALUES ('last-model', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", params: [model] }).catch(() => {});
        return { agent: created };
    } catch (error: any) {
        if (!opts.projectId && opts.createWorkspaceDir !== '1' && String(error?.message ?? '').startsWith('workspace directory not found:')) return { confirmation: { dir: resolve(requestedWorkspace.trim() || process.cwd()), values: opts } };
        return { error: String(error?.message ?? 'Invalid workspace') };
    }
}
