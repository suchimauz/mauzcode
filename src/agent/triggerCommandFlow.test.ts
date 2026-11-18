import { describe, expect, test } from 'bun:test';
import { mkModelsTestCtx } from './modelsTestCtx.entry';

// Mocked conversations: the model is scripted, tools run for real. `eval` runs a named
// script against the preset-guarded facade, exactly as the agent's code would.
type Script = (fns: any, agent: any) => Promise<unknown>;
async function setup(scripts: Record<string, Script>, presetId = 'standard') {
    const ctx: any = await mkModelsTestCtx();
    ctx.fns.agent.syncPlanningContext = async () => {};
    const seen: string[][] = [];
    const stream = ctx.state.registry.models.stream;
    ctx.state.registry.models.stream = async (c: any, s: any, o: any) => { seen.push(o.messages.filter((m: any) => m.role === 'user').map((m: any) => String(m.content))); return stream(c, s, o); };
    ctx.state.registry.repl.eval = async (c: any, _s: any, o: { code: string; agent?: any }) => {
        const fns = o.agent?.preset ? c.fns.agentPreset.guardFns({ snapshot: o.agent.preset }) : c.fns;
        return JSON.stringify(await scripts[o.code]!(fns, o.agent)) ?? 'null';
    };
    const agent = await ctx.fns.agent.start({ model: 'mock/default:test', preset: await ctx.fns.agentPreset.resolve({ id: presetId }) });
    const say = async (text: string, turns: any[], requestId: string = crypto.randomUUID()) => {
        agent.scratchpad.mockLLM = { turns, defaultText: 'ok' }; agent.scratchpad.mockTurn = 0;
        await ctx.fns.session.save({ agent });
        await ctx.fns.commands.dispatch({ agentId: agent.id, text, requestId });
        await ctx.fns.session.syncAgentState({ agent });
        await ctx.fns.agent.run({ agent, userText: text, userMessageAlreadyAppended: true });
    };
    const evalCall = (code: string, id?: string) => ({ toolCalls: [{ ...(id ? { id } : {}), name: 'eval', args: { code } }] });
    const toolResults = async () => (await ctx.fns.session.getMessages({ id: agent.id })).filter((m: any) => m.role === 'tool').map((m: any) => String(m.content));
    const armed = async () => (await ctx.fns.agent.armedTriggers({ id: agent.id })).triggers;
    const lifecycle = async () => (await ctx.fns.session.getEvents({ id: agent.id })).filter((e: any) => e.type === 'trigger_lifecycle');
    return { ctx, agent, say, evalCall, seen, toolResults, armed, lifecycle };
}

describe('/trigger conversations', () => {
    test('bare command reaches the model as human text and asking creates nothing', async () => {
        const f = await setup({});
        await f.say('/trigger', [{ text: 'Какой триггер добавить: разовый, расписание или условие?' }]);
        expect(f.seen[0]).toContain('/trigger');
        expect(await f.armed()).toHaveLength(0);
        expect(await f.lifecycle()).toHaveLength(0);
    });

    test('a complete request creates exactly once, badged on its tool call without a duplicate entry', async () => {
        const f = await setup({ create: (fns, agent) => fns.agent.wake({ id: agent.id, inMs: 20 * 60_000, prompt: 'check the build' }) });
        await f.say('/trigger in 20 minutes check the build', [f.evalCall('create', 'call_create'), { text: 'Добавил разовый запуск через 20 минут.' }]);
        const triggers = await f.armed();
        expect(triggers).toHaveLength(1);
        expect(triggers[0]).toMatchObject({ kind: 'at', purpose: 'check the build' });
        expect(Number(triggers[0].nextAt) - Date.now()).toBeGreaterThan(19 * 60_000);
        const [row] = await f.ctx.fns.procs.db.select({ sql: 'SELECT created_by_agent_id,created_by_tool_call_id FROM agent_triggers WHERE id=?', params: [triggers[0].id] });
        expect(row).toEqual({ created_by_agent_id: f.agent.id, created_by_tool_call_id: 'call_create' });
        expect(await f.lifecycle()).toHaveLength(0);
    });

    test('a failed creation reports an error and arms nothing', async () => {
        const f = await setup({ create: (fns, agent) => fns.agent.wake({ id: agent.id, at: Date.now() - 1000, prompt: 'in the past' }) });
        await f.say('/trigger yesterday remind me', [f.evalCall('create'), { text: 'Не удалось: время уже прошло, ничего не создано.' }]);
        expect((await f.toolResults()).at(-1)).toContain('time must be in the future');
        expect(await f.armed()).toHaveLength(0);
    });

    test('several matches: clarification then one cancellation naming its target; replay after clarification is a no-op', async () => {
        const scripts: Record<string, Script> = {
            list: async (fns, agent) => (await fns.agent.triggers({ id: agent.id, status: 'active' })).map((t: any) => ({ id: t.id, prompt: t.prompt })),
            cancel: async (fns, agent) => {
                const [target] = (await fns.agent.triggers({ id: agent.id, status: 'active' })).filter((t: any) => t.prompt.startsWith('Daily report'));
                return fns.agent.applyTriggerAction({ triggerId: target.id, action: 'cancel' });
            },
        };
        const f = await setup(scripts);
        // A retried call targets the already-resolved id (e.g. after a lost tool result).
        scripts.retry = fns => fns.agent.applyTriggerAction({ triggerId: daily.id, action: 'cancel' });
        const daily = await f.ctx.fns.agent.cron({ id: f.agent.id, expression: '0 9 * * *', timezone: 'UTC', prompt: 'Daily report' });
        await f.ctx.fns.agent.cron({ id: f.agent.id, expression: '0 18 * * *', timezone: 'UTC', prompt: 'Weekly report' });
        await f.say('/trigger cancel the report', [f.evalCall('list'), { text: 'Подходят два: Daily report и Weekly report. Какой отменить?' }], 'cmd-1');
        expect(await f.armed()).toHaveLength(2);
        // The clarification answer is a plain message; the action identity still comes from the accepted command.
        f.agent.scratchpad.mockLLM = { turns: [f.evalCall('cancel'), f.evalCall('retry'), { text: `Отменил ${daily.id} (cron): Daily report.` }] }; f.agent.scratchpad.mockTurn = 0;
        await f.ctx.fns.session.save({ agent: f.agent });
        await f.ctx.fns.agent.run({ agent: f.agent, userText: 'daily' });
        const results = (await f.toolResults()).slice(-2).map((text: string) => JSON.parse(text));
        expect(results[0]).toMatchObject({ outcome: 'cancelled', triggerId: daily.id, kind: 'cron', purpose: 'Daily report' });
        expect(results[1]).toMatchObject({ outcome: 'cancelled', duplicate: true });
        expect((await f.armed()).map((t: any) => t.purpose)).toEqual(['Weekly report']);
        expect((await f.lifecycle()).filter((e: any) => e.transition === 'cancelled')).toHaveLength(1);
    });

    test('zero matches never substitute another trigger; an unknown id changes nothing', async () => {
        const f = await setup({ cancel: fns => fns.agent.applyTriggerAction({ triggerId: 'tr_missing', action: 'cancel' }) });
        await f.ctx.fns.agent.wake({ id: f.agent.id, inMs: 60_000, prompt: 'Other work' });
        await f.say('/trigger cancel the backup', [f.evalCall('cancel'), { text: 'Такого триггера нет, ничего не изменено.' }]);
        expect(JSON.parse((await f.toolResults()).at(-1)!)).toMatchObject({ ok: false, outcome: 'not_active' });
        expect(await f.armed()).toHaveLength(1);
    });

    test('run now is accepted, not delivered; a paused recipient is deferred', async () => {
        const f = await setup({
            run: async (fns, agent) => fns.agent.applyTriggerAction({ triggerId: (await fns.agent.triggers({ id: agent.id }))[0].id, action: 'run' }),
        });
        const made = await f.ctx.fns.agent.wake({ id: f.agent.id, inMs: 3_600_000, prompt: 'Ship it' });
        await f.say('/trigger run ship it now', [f.evalCall('run'), { text: 'Запланировал; запуск появится после доставки.' }]);
        expect(JSON.parse((await f.toolResults()).at(-1)!)).toMatchObject({ outcome: 'scheduled', triggerId: made.id });
        expect((await f.ctx.fns.session.getMessages({ id: f.agent.id })).some((m: any) => m.message_type === 'trigger')).toBe(false);
        await f.ctx.fns.procs.db.run({ sql: 'UPDATE agents SET stopped_at=? WHERE id=?', params: [Date.now(), f.agent.id] });
        const paused = await f.ctx.fns.agent.triggerAction({ agentId: f.agent.id, triggerId: made.id, action: 'run', requestId: 'paused' });
        expect(paused.outcome).toBe('deferred_paused');
    });

    test('PLAN with a pending review: clarification only, no mutation, mode and review unchanged', async () => {
        const f = await setup({
            create: (fns, agent) => fns.agent.wake({ id: agent.id, inMs: 60_000, prompt: 'Planned' }),
            cancel: async (fns, agent) => fns.agent.applyTriggerAction({ triggerId: (await fns.agent.triggers({ id: agent.id }))[0].id, action: 'cancel' }),
        });
        await f.ctx.fns.agent.wake({ id: f.agent.id, inMs: 60_000, prompt: 'Existing' });
        await f.ctx.fns.procs.db.run({ sql: `INSERT INTO agent_planning(agent_id,mode,revision,proposal,updated_at) VALUES (?,'plan',4,'{"status":"pending","id":"p"}'::jsonb,?)`, params: [f.agent.id, Date.now()] });
        await f.say('/trigger in 1 minute plan; cancel existing', [f.evalCall('create'), f.evalCall('cancel'), { text: 'В режиме планирования ничего не меняю.' }]);
        const results = await f.toolResults();
        expect(results.at(-2)).toContain('Planning mode');
        expect(JSON.parse(results.at(-1)!)).toMatchObject({ ok: false, outcome: 'planning' });
        expect((await f.armed()).map((t: any) => t.purpose)).toEqual(['Existing']);
        const [planning] = await f.ctx.fns.procs.db.select({ sql: "SELECT mode,revision,proposal->>'status' AS status FROM agent_planning WHERE agent_id=?", params: [f.agent.id] });
        expect(planning).toEqual({ mode: 'plan', revision: 4, status: 'pending' });
    });

    test('a preset without the grant cannot run or cancel through the agent capability', async () => {
        const f = await setup({ cancel: async (fns, agent) => fns.agent.applyTriggerAction({ triggerId: 'x', action: 'cancel' }) }, 'minimal');
        await f.say('/trigger cancel x', [f.evalCall('cancel'), { text: 'Нет доступа.' }]);
        const last = (await f.toolResults()).at(-1)!;
        expect(last).toMatch(/not available|unknown tool|not permitted|available tools/i);
    });
});
