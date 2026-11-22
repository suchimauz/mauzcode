import { expect, spyOn, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';
import { runClaimed } from '../agent/modelsTestCtx.entry';
import codex from './$modelProvider_codex';
import getControls from '../agent/$route_$id_codex-controls_GET';
import postControls from '../agent/$route_$id_codex-controls_POST';
import fixture from './fixtures/codex-controls/0.170.0.json';

// End to end through owner picker endpoints, isolated PG and the normal agent/SDK/direct transport.
// Only the browser identity, issuer credentials and remote HTTP peer are fixtures.
test('picker consent survives reload, but not a fork, delegation, capability removal or account change', async () => {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString('base64'), CODEX_CLI_VERSION: fixture.codexCli } });
    const { bundledModelExcerpt: model } = fixture;
    const wire: { account: string | null; tier?: string; verbosity?: string }[] = [];
    const unexpected: string[] = [];
    let holdResponse: (() => Promise<void>) | undefined;
    let requestTool = false;
    const fast = new Set(['A', 'B']);
    const backend = async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const path = new URL(String(url)).pathname;
        const account = new Headers(init?.headers).get('chatgpt-account-id');
        if (path === '/backend-api/codex/models') {
            const m = fast.has(account ?? '') ? model : { ...model, service_tiers: [], additional_speed_tiers: [] };
            return Response.json({ models: [m] });
        }
        if (path === '/backend-api/codex/responses') {
            const body = JSON.parse(String(init?.body));
            wire.push({ account, tier: body.service_tier, verbosity: body.text?.verbosity });
            if (holdResponse) await holdResponse();
            const event = body.input?.at(-1)?.type === 'compaction_trigger'
                ? { type: 'response.output_item.done', item: { type: 'compaction', encrypted_content: 'fixture' } }
                : requestTool
                    ? { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'tool-fixture', name: 'read', arguments: '{"path":"README.md"}' } }
                    : { type: 'response.output_text.delta', delta: 'ok' };
            requestTool = false;
            return new Response(`data: ${JSON.stringify(event)}\n\ndata: {"type":"response.completed","response":{"id":"fixture","status":"completed"}}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
        }
        unexpected.push(path); throw new Error('Unexpected external request');
    };
    const http = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(backend, { preconnect() { throw new Error('Unexpected preconnect'); } }));
    try {
        ctx.state.models.providers = { codex: { definition: codex, owner: 'core', module: 'models', rel: 'models/$modelProvider_codex.ts' } };
        const registry = ctx.state.registry;
        registry.auth.currentUser = async () => ({ required: true, user: { id: 'owner', disabledAt: null } });
        registry.auth.actorId = async () => 'owner';
        registry.auth.csrfToken = async () => 'owner-csrf';
        // Price enrichment is unrelated to inference. Other network escapes fail the test.
        registry.models.catalog.priceCatalog = async () => ({});
        const connection = (name: string) => ctx.fns.models.create({ provider: 'codex', accountName: name, config: {}, secrets: {} });
        const [left, right] = await Promise.all([connection('work'), connection('other')]);
        const login = async (id: string, account: string) => {
            const { conn } = await ctx.fns.models.connections.resolve({ id });
            const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, 'https://api.openai.com/auth': { chatgpt_account_id: account } })).toString('base64url');
            const intent = crypto.randomUUID();
            await ctx.fns.procs.db.run({ sql: 'UPDATE llm_connections SET codex_login_intent=? WHERE id=?', params: [intent, id] });
            await ctx.fns.models.provider.codex.codexAuth({ conn, op: 'store', intent, tokens: { access_token: `e30.${payload}.fixture`, refresh_token: 'test-only' } });
            const list = await ctx.fns.models.listModels({ id, refresh: true });
            expect(list.error).toBeUndefined(); expect(list.models[0]?.id).toBe(model.slug);
        };
        await login(left.id, 'A'); await login(right.id, 'other');
        const route = `codex/work:${model.slug}`;
        const started = await ctx.fns.agent.start({ model: route });
        const view = async (id: string, body?: object) => {
            const req = new Request(`http://localhost/agent/${id}/codex-controls`, body ? { method: 'POST', body: JSON.stringify({ csrfToken: 'owner-csrf', ...body }) } : {});
            const res = await (body ? postControls : getControls)(ctx, null, { req, params: { id } });
            return { status: res.status, data: await res.json() as any };
        };
        const before = await view(started.id);
        expect(before.data).toMatchObject({ speed: 'standard', speeds: ['standard', 'fast'] });
        const select = (revision: string) => view(started.id, { action: 'save', route, revision, speed: 'fast', verbosity: 'high' });
        expect((await select(before.data.revision)).status).toBe(200);
        const agent = await ctx.fns.session.load({ id: started.id });
        ctx.state.agent[agent.id] = agent;
        const saved = await view(agent.id);
        expect(saved.data).toMatchObject({ speed: 'fast', verbosity: 'high' });
        const reply = async (chat: types.agent.Agent) => {
            const n = wire.length;
            await runClaimed(ctx, chat, 'Acknowledge with ok.');
            expect(wire.length).toBe(n + 1);
            return wire[n];
        };
        requestTool = true;
        await runClaimed(ctx, agent, 'Read the README and reply.');
        const paid = { account: 'A', tier: 'priority', verbosity: 'high' };
        expect(wire).toEqual([paid, paid]); // initial answer and tool-result continuation
        const { id: sessionId } = agent;
        const ordinary = { account: 'A', tier: undefined, verbosity: undefined };
        await ctx.fns.agent.readAndSummarize({ agent, file: 'README.md', task: 'Summarize' });
        await ctx.fns.models.call({ sessionId, connectionId: left.id, model: model.slug, user: 'independent' });
        await ctx.fns.models.compact({ sessionId, connectionId: left.id, model: model.slug, instructions: 'Compact', messages: [{ role: 'user', content: 'fixture' }] });
        expect(wire.slice(2)).toEqual([ordinary, ordinary, ordinary]);
        const fork = await ctx.fns.session.fork({ id: agent.id });
        expect((await view(fork.id)).data.speed).toBe('standard');
        expect(await reply(fork)).toEqual({ account: 'A', tier: undefined, verbosity: undefined });
        const child = await ctx.fns.agent.delegate({ agent, title: 'Independent child', tasks: [{ id: 'read', title: 'Read a fixture' }] });
        expect((await view(child.id)).data).toMatchObject({ speed: 'standard', verbosity: null });
        const other = await ctx.fns.agent.start({ model: `codex/other:${model.slug}` });
        expect((await view(other.id)).data.speeds).not.toContain('fast');
        expect(await reply(other)).toEqual({ account: 'other', tier: undefined, verbosity: undefined });
        const staleRevision = (await view(agent.id)).data.revision;
        const transport = registry.models.transport.fetch;
        let waiting = 0;
        const ready = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
        registry.models.transport.fetch = async (c: Context, s: Session | null, o: Parameters<Context['fns']['models']['transport']['fetch']>[0]) => {
            if (o.url.endsWith('/codex/responses') && waiting < 2) {
                if (++waiting === 2) ready.resolve();
                await resume.promise;
            }
            return transport(c, s, o);
        };
        const sdkPending = ctx.fns.models.call({ sessionId, connectionId: left.id, model: model.slug, user: 'explicit', providerOptions: { speed: 'fast' } });
        const chatPending = reply(agent);
        await ready.promise;
        fast.delete('A');
        expect((await ctx.fns.models.listModels({ id: left.id, refresh: true })).error).toBeUndefined();
        expect((await select(staleRevision)).status).toBe(409);
        resume.resolve();
        await expect(sdkPending).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        expect(await chatPending).toEqual({ account: 'A', tier: undefined, verbosity: 'high' });
        registry.models.transport.fetch = transport;
        expect((await view(agent.id)).data).toMatchObject({ speed: 'standard', verbosity: 'high', noticePending: true });
        const notices = await ctx.fns.procs.db.select({ sql: 'SELECT id FROM codex_control_notices WHERE agent_id=?', params: [agent.id] });
        expect(notices).toHaveLength(1);
        fast.add('A');
        await ctx.fns.models.listModels({ id: left.id, refresh: true });
        expect((await select((await view(agent.id)).data.revision)).status).toBe(200);
        const old = (await view(agent.id)).data.revision;
        const handed = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
        holdResponse = () => { handed.resolve(); return finish.promise; };
        const alreadySent = reply(agent);
        await handed.promise;
        await login(left.id, 'B'); // must complete even while the admitted remote response is pending
        holdResponse = undefined;
        finish.resolve();
        expect(await alreadySent).toEqual(paid);
        expect((await select(old)).status).toBe(409);
        expect((await view(agent.id)).data).toMatchObject({ speeds: ['standard', 'fast'], speed: 'standard', verbosity: null });
        expect(await reply(agent)).toEqual({ account: 'B', tier: undefined, verbosity: undefined });
        expect(unexpected).toEqual([]);
    } finally { http.mockRestore(); }
}, 60_000);
