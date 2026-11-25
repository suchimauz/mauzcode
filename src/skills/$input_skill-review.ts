// Protected review of one staged skill package. Only the dedicated browser route can approve it:
// generic input.submit and tool arguments are refused, and approval is bound to the draft digest.
export const hint = 'Internal: opened by skills.add.review({ draftId }), never directly.';

export default {
    requires: ['input.request', 'skills.add.review'],
    icon: 'book-open',
    cancel: false,
    completionAuthority: {},
    prepare(_ctx: Context, opts: { spec: Record<string, any> }) {
        const s = opts.spec;
        if (Object.keys(s).some(k => !['draftId', 'digest', 'skillId', 'destination', 'expiresAt'].includes(k)) || typeof s.draftId !== 'string' || !/^[0-9a-f]{64}$/.test(String(s.digest))) {
            throw new Error('Use skills.add.review({ draftId }) to open a skill review');
        }
        return s;
    },
    deadline(_ctx: Context, opts: { spec: Record<string, any> }) { return Number(opts.spec.expiresAt) || undefined; },
    projectCard(_ctx: Context, opts: { input: types.input.Row }) { return { skillId: opts.input.spec.skillId, destination: opts.input.spec.destination }; },
    async open(ctx: Context, opts: { input: types.input.Row }) {
        const esc = (v: unknown) => Bun.escapeHTML(String(v));
        const loaded = await ctx.fns.skills.drafts({ action: 'load', id: String(opts.input.spec.draftId) });
        if (!loaded.ok || loaded.draft.digest !== opts.input.spec.digest) return '<p role="alert">The staged package is no longer available or changed. Ask the agent to prepare it again.</p>';
        const d = loaded.draft;
        const where = d.destination === 'workspace' ? `this project's workspace (${esc(d.workspace.host ? d.workspace.host + ':' : '')}${esc(d.workspace.dir)}/.mauzcode/skills/${esc(d.name)})`
            : d.destination === 'serverProject' ? 'the server library for this project only' : 'the server library for all projects';
        const rows = d.files.map(f => `<li><code>${esc(f.path)}</code> — ${Buffer.from(f.data, 'base64').length} bytes${f.executable ? ', executable' : ''}${f.adapted ? ', <strong>adapted</strong>' : ''}</li>`).join('');
        const textOf = (f: types.skills.StagedFile) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(f.data, 'base64')); } catch { return null; } };
        const manifest = d.files.find(f => f.path === 'SKILL.md')!;
        const diffs = Object.entries(d.originals).map(([path, before]) => {
            const after = textOf(d.files.find(f => f.path === path)!) ?? '';
            return `<details open><summary>Proposed change: <code>${esc(path)}</code></summary><p>Original</p><pre class="whitespace-pre-wrap text-xs">${esc(before)}</pre><p>Proposed</p><pre class="whitespace-pre-wrap text-xs">${esc(after)}</pre></details>`;
        }).join('');
        return `<dl class="text-sm"><dt>Skill</dt><dd><code>${esc(d.skillId)}</code></dd><dt>Destination</dt><dd>${where}</dd><dt>Source</dt><dd>${esc(d.source)}</dd><dt>Content digest</dt><dd><code>${esc(d.digest.slice(0, 16))}</code></dd></dl>`
            + `<p class="text-sm">Files</p><ul class="text-sm">${rows}</ul>`
            + `<details><summary>SKILL.md</summary><pre class="whitespace-pre-wrap text-xs">${esc(textOf(manifest) ?? '')}</pre></details>${diffs}`;
    },
    buttons(_ctx: Context, opts: { input: types.input.Row }) {
        const id = Bun.escapeHTML(opts.input.id);
        const target = '#input-' + opts.input.id.replace(/[^A-Za-z0-9_-]/g, '');
        const headers = `hx-headers='js:{"x-csrf-token": document.querySelector("meta[name=csrf-token]")?.content || ""}'`;
        const button = (decision: string, label: string, tone: string) => `<button type="button" class="btn btn-sm ${tone}" hx-post="/skills/review/${id}" hx-vals='{"decision":"${decision}","digest":"${Bun.escapeHTML(String(opts.input.spec.digest))}"}' ${headers} hx-target="${target}" hx-swap="outerHTML">${label}</button>`;
        return button('cancel', 'Cancel', 'btn-ghost') + button('approve', 'Add skill', 'btn-primary');
    },
    submit() { throw new Error('Skill publication requires the review buttons'); },
    done(_ctx: Context, opts: { input: types.input.Row }) {
        const r = opts.input.result ?? {};
        const esc = (v: unknown) => Bun.escapeHTML(String(v));
        if (r.status === 'published') return `<p>Added and verified <code>${esc(r.skillId)}</code>.</p>`;
        if (r.status === 'unverified') return `<p role="alert">Saved <code>${esc(r.skillId)}</code>, but verification failed: ${esc(r.reason)}. Inspect it before trying again; nothing will be reinstalled automatically.</p>`;
        return `<p>Not added: ${esc(r.reason ?? 'cancelled')}.</p>`;
    },
} satisfies types.input.Kind;
