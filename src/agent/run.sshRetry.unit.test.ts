import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as timers from 'node:timers/promises';
import run from './run';
import retrySchedule from './retrySchedule';
import retryWait from './retryWait';

// Offline owned-run harness: no network, DB, live agents or real retry delays.
const interrupted = () => Object.assign(new Error('Retryable rejected transport request'), {failure:{code:'TRANSPORT',classification:'transport',retryable:true,replaySafe:true,acceptance:'rejected'}});
const done = { text: 'done', usage: null, finishReason: 'stop', toolCalls: [] };
const tool = { text: '', usage: null, finishReason: 'tool_calls', toolCalls: [{ id: 'saved-tool', name: 'write', args: { path: 'test' } }] };
function harness(turns: any[]) {
    const rows: any[] = [{ idx: 0, role: 'user', content: 'go' }];
    const errors: string[] = [];
    const snapshots: any[][] = [];
    const delays: number[] = [];
    const agent: any = { id: 'ssh-retry-test', model: 'custom/account:test', currentJobId: 'owned', messages: rows.slice(), scratchpad: {}, events: [] };
    let sampled = 0, calls = 0, attempt = 0;
    let pending: any = null;
    const events: any[] = [];
    let now = 1_000_000;
    spyOn(Date, 'now').mockImplementation(() => now);
    let stopped: number | null = null;
    let token = 'owned';
    let duringWait: () => void | Promise<void> = () => {};
    spyOn(timers, 'setTimeout').mockImplementation((async (ms: number, _value: unknown, opts: { signal: AbortSignal }) => {
        delays.push(ms);
        await duringWait();
        now += ms;
        opts.signal.throwIfAborted();
    }) as typeof timers.setTimeout);
    const append = async ({ message }: any) => { const row = { ...message, idx: rows.length }; rows.push(row); return row; };
    const noop = async () => {};
    const ctx: any = { state: { agent: { [agent.id]: agent } }, fns: {
        input: { isWaiting: async () => false },
        settings: { get: async () => ({ jitterRatio: 0 }) },
        planning: { read: async ({agentId}: any) => ({version:1,agentId,mode:'execute',revision:0,scope:'session',advisory:true,runningPolicy:'reject',pending:null,proposal:null}) },
        goal: { delegationScope: async ({ fn }: any) => fn(), runBindingCapture: async () => ({ kind: 'disabled', allowContinuation: false }) },
        session: {
            forAgent: () => null, appendMessage: append,
            appendEvent: async ({ event }: any) => { events.push(event); },
            syncAgentState: async () => { agent.messages = rows.slice(); },
            recordContextUsage: noop, appendAssistantEvent: async () => ({idx: 0}), appendToolCallEvent: noop,
            appendErrorEvent: async ({ error }: any) => { errors.push(error); },
            updateMessageContent: async ({ idx, content }: any) => { rows[idx].content = content; },
        },
        procs: { events: { emit: noop }, db: {
            transaction: async ({ fn }: any) => fn(),
            run: async ({ sql, params }: any) => {
                if (sql.includes('llm_retry_attempt = 0')) { attempt = 0; pending = null; }
                else if (sql.includes('llm_retry_attempt = ?')) { attempt = params[0]; pending = JSON.parse(params[1]); }
                else if (sql.includes('llm_retry_pending = NULL')) pending = null;
                else throw new Error(`Unexpected write: ${sql}`);
            }, select: async ({ sql }: any) => sql.includes('MAX(idx)')
            ? [{ i: Math.max(...rows.filter(r => r.role === 'user' && !r.excluded_from_cursor).map(r => r.idx)) }]
            : [{ stopped_at: stopped, run_state: 'running', run_token: token, llm_retry_attempt: attempt, llm_retry_pending: pending }] } },
        agent: {
            buildLlmRequest:async()=>({instructions:'',messages:[]}),wireTools:()=>[],cacheRoot:async()=>agent.id,
            promoteQueuedTurn: noop,
            retrySchedule: (opts: any) => retrySchedule(ctx, null, opts),
            retryWait: (opts: any) => retryWait(ctx, null, opts),
            recordRunLifecycle: async () => {}, statusLineForTurn: async () => '', autoCompactIfNeeded: async () => ({ status: 'not_needed' }),
            stashResult: async ({ output }: any) => ({ content: output }) },
        events: { emitAgentsChanged: noop, refreshAgentMeta: noop },
        markdown: { render: async ({ source }: any) => source },
        models: {
            resolveRoute: async()=>({provider:'custom',model:'test',connectionId:'c'}),
            stream: async (opts: any) => {
            snapshots.push(structuredClone(agent.messages));
            if (sampled >= turns.length) throw new Error('unexpected extra model request');
            const turn = turns[sampled++];
            if (turn instanceof Error) throw turn;
            return typeof turn === 'function' ? await turn(opts) : turn;
        } },
        tools: { call: async () => { calls++; return { output: 'saved result' }; }, runs: () => [] },
    } };
    return { ctx, agent, rows, errors, snapshots, delays, events,
        get attempt() { return attempt; }, get pending() { return pending; },
        get sampled() { return sampled; }, get calls() { return calls; },
        wait: (fn: typeof duringWait) => { duringWait = fn; },
        stop: (abort: boolean) => { stopped = 1; if (abort) agent.abortController.abort(); },
        replace: () => { token = 'replacement'; },
        execute: () => run(ctx, null, { agent, userText: '', userMessageAlreadyAppended: true }),
    };
}
afterEach(() => mock.restore());

describe('bounded models inference retry at the agent sampling boundary', () => {
    for (const type of ['text_delta','tool_args_delta']) test(`partial ${type} prevents automatic replay even if upstream claims safe`,async()=>{const error=interrupted(); const h=harness([(opts:any)=>{opts.onEvent({type,delta:'partial'});throw error;},done]); await expect(h.execute()).rejects.toBe(error);expect(h.sampled).toBe(1);expect(h.delays).toEqual([]);expect(h.rows.filter(r=>r.role==='assistant')).toEqual([]);});
    test('normal policy exhausts exactly five retries', async () => {
        const last = interrupted();
        const h = harness([...Array.from({ length: 5 }, interrupted), last, done]);
        await expect(h.execute()).rejects.toBe(last);
        expect(h.sampled).toBe(6);
        expect(h.delays).toEqual([1000, 2000, 4000, 8000, 16000]);
        expect(h.errors).toEqual([]);
        expect(h.calls).toBe(0);
    });
    test('completed mutating tool and its saved result are not replayed', async () => {
        const h = harness([tool, interrupted(), done]);
        await h.execute();
        expect(h.calls).toBe(1);
        expect(h.sampled).toBe(3);
        expect(h.snapshots[2].filter(r => r.role === 'tool')).toMatchObject([{ tool_call_id: 'saved-tool', content: 'saved result' }]);
        expect(h.rows.filter(r => r.role === 'tool')).toHaveLength(1);
    });
    test('successful tool cycles reset the durable retry attempt', async () => {
        const h = harness([interrupted(), tool, interrupted(), done]);
        expect((await h.execute()).text).toBe('done');
        expect(h.calls).toBe(1);
        expect(h.sampled).toBe(4);
        expect(h.delays).toEqual([1000, 1000]);
        expect(h.events.filter(e => e.type === 'llm_retry').map(e => e.retry)).toEqual([1, 1]);
        expect(h.attempt).toBe(0);
    });
    for (const [label, error] of [
        ['unclassified text', new Error(interrupted().message)],
        ['permanent access', Object.assign(new Error('denied'), { transportFailure: { kind: 'ssh_transport', phase: 'permanent', retryable: false } })],
        ['quota', Object.assign(new Error('quota'), { failure: { code: 'QUOTA_EXHAUSTED', classification:'quota', retryable:false, replaySafe:true, acceptance:'rejected' } })],
        ['auth', Object.assign(new Error('auth'), { failure: { kind: 'auth', code: 'AUTH', retryable: false } })],
    ] as const) test(`does not treat ${label} as retryable inference loss`, async () => {
        const h = harness([error, done]);
        await expect(h.execute()).rejects.toBe(error);
        expect(h.sampled).toBe(1);
        expect(h.delays).toEqual([]);
    });
    for (const abort of [true, false]) test(`Stop during backoff prevents the retry (local abort=${abort})`, async () => {
        const h = harness([interrupted(), done]);
        h.wait(() => h.stop(abort));
        await expect(h.execute()).rejects.toMatchObject({ name: 'AbortError' });
        expect(h.sampled).toBe(1);
    });
    test('a replaced durable run token prevents the retry', async () => {
        const h = harness([interrupted(), done]);
        h.wait(() => h.replace());
        await expect(h.execute()).rejects.toMatchObject({ name: 'AbortError' });
        expect(h.sampled).toBe(1);
    });
    test('replacement controller during backoff is not cleared or reused', async () => {
        const h = harness([interrupted(), done]);
        const replacement = new AbortController();
        h.wait(() => { h.agent.abortController = replacement; });
        await expect(h.execute()).rejects.toMatchObject({ name: 'AbortError' });
        expect(h.sampled).toBe(1);
        expect(h.agent.abortController).toBe(replacement);
    });
    for (const error of [
        interrupted(),
        ...['RATE_LIMITED', 'PROVIDER_ERROR', 'TRANSPORT'].map(code => Object.assign(new Error(code), {
            failure: { code, classification:'provider', retryable:true, replaySafe:true, acceptance:'rejected' },
        })),
    ]) test(`common policy retries ${error.message}`, async () => {
        const h = harness([error, done]);
        expect((await h.execute()).text).toBe('done');
        expect(h.sampled).toBe(2);
        expect(h.delays).toEqual([1000]);
        expect(h.errors).toEqual([]);
        expect(h.attempt).toBe(0);
    });
});
