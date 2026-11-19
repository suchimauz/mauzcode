import { describe, expect, spyOn, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import list from "../api/$route_voice_errors_GET";
import lookup from "../api/$route_voice_errors_$id_GET";
import loadCron from "../cron/$loader_cron";
import schedule from "./$cron_voiceErrorJournalExpiry";
import openai from "./$voiceProvider_openai-realtime";

type Diagnostic = { id: string; createdAt: string; provider: string | null; model: string | null; stage: string; cause: string; reason?: string | null; detail?: string | null };
const recentRows = async (response: Response) => ((await response.json()) as { errors: Diagnostic[] }).errors;
const exactRow = async (response: Response) => ((await response.json()) as { error: Diagnostic }).error;

const WEEK = 7 * 86400000;
const failure = { provider: openai.id, model: openai.models![0]!.id, stage: "streaming", cause: "rateLimit" };
async function fixture() {
    const ctx = await mkTestCtx();
    ctx.state.voice ??= {};
    ctx.state.voice.providers = { [openai.id]: { definition: openai } };
    const get = (role: string | null, id?: string) => {
        const request = Object.create(ctx);
        const path = '/api/voice/errors' + (id === undefined ? '' : '/' + id);
        const req = new Request('http://localhost' + path);
        request.session = { req, user: role && { id: role + '-fixture', role } };
        return id === undefined ? list(request, request.session, { req, params: {} }) : lookup(request, request.session, { req, params: { id } });
    };
    return { ctx, get };
}

describe('voice error journal', () => {
    test('owner reads only closed diagnostic fields; a direct non-owner lookup of a known ID discloses nothing', async () => {
        const { ctx, get } = await fixture();
        const id = await ctx.fns.voice.journal.record(failure);
        expect(id).toMatch(/^[a-f0-9]{16}$/);
        const res = await get('owner', id);
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        const error = await exactRow(res);
        expect(error).toEqual({ id, createdAt: new Date(error.createdAt).toISOString(), ...failure, reason: null, detail: null });
        expect(await recentRows(await get('owner'))).toContainEqual(error);
        for (const role of [null, 'member']) for (const key of [undefined, id]) {
            const denied = await get(role, key);
            expect(denied.status).toBe(role ? 403 : 401);
            expect(await denied.json()).toEqual({ error: role ? 'Forbidden' : 'Unauthorized' });
        }
        const canary = 'sensitive-canary';
        const sanitized = await ctx.fns.voice.journal.record({ provider: canary, model: canary, stage: 'opening', cause: canary });
        expect(await exactRow(await get('owner', sanitized))).toMatchObject({ provider: null, model: null, cause: 'unknown' });
        expect(await ctx.fns.voice.journal.record({ ...failure, stage: canary })).toBeNull();
        expect((await get('owner', '0000000000000000')).status).toBe(404);
        expect((await get('owner', 'bad-format')).status).toBe(404);
    });

    test('reason and detail are normalized: unknown reasons become other and unsafe details are dropped', async () => {
        const { ctx, get } = await fixture();
        const read = async (opts: { reason?: string; detail?: string }) => exactRow(await get('owner', await ctx.fns.voice.journal.record({ ...failure, cause: 'unknown', ...opts })));
        expect(await read({ reason: 'socketClosed', detail: '1006' })).toMatchObject({ reason: 'socketClosed', detail: '1006' });
        expect(await read({ reason: 'serviceError', detail: 'session_expired' })).toMatchObject({ reason: 'serviceError', detail: 'session_expired' });
        expect(await read({ reason: 'socketError', detail: 'http_502' })).toMatchObject({ reason: 'socketError', detail: 'http_502' });
        expect(await read({ reason: 'sensitive-canary', detail: '999' })).toMatchObject({ reason: 'other', detail: null });
        for (const detail of ['Session Expired', 'https://api.openai.com/v1', 'sk-' + 'A'.repeat(40), 'a'.repeat(65), '5000', 'x y']) {
            expect(await read({ reason: 'serviceError', detail })).toMatchObject({ reason: 'serviceError', detail: null });
        }
    });

    test('recent list is bounded and ordered; concurrent records have distinct exact references', async () => {
        const { ctx, get } = await fixture();
        const clock = spyOn(Date, 'now').mockReturnValue(Date.UTC(2080, 1, 1));
        try {
            const ids: string[] = await Promise.all(Array.from({ length: 101 }, () => ctx.fns.voice.journal.record(failure)));
            expect(ids.every(id => /^[a-f0-9]{16}$/.test(id))).toBe(true);
            expect(new Set(ids).size).toBe(101);
            clock.mockReturnValue(Date.UTC(2080, 1, 2));
            const newest = await ctx.fns.voice.journal.record(failure);
            const recent = await recentRows(await get('owner'));
            expect(recent.map((row: { id: string }) => row.id)).toEqual([newest, ...ids.sort().reverse().slice(0, 99)]);
            expect((await get('owner', ids.at(-1)!)).status).toBe(200);
        } finally { clock.mockRestore(); }
    });

    test('at exactly seven days both reads hide a record; the overdue scheduled run physically purges it after downtime', async () => {
        const { ctx, get } = await fixture();
        const start = Date.UTC(2081, 1, 1);
        const clock = spyOn(Date, 'now').mockReturnValue(start);
        const count = async (id: string) => Number((await ctx.fns.procs.db.select({ sql: 'SELECT COUNT(*) AS n FROM voice_error_journal WHERE id=?', params: [id] }))[0].n);
        try {
            const id = await ctx.fns.voice.journal.record(failure);
            await loadCron(ctx, null, { entries: [{ name: 'voiceErrorJournalExpiry', fn: schedule, rel: 'voice/$cron_voiceErrorJournalExpiry.ts' }] });
            await ctx.fns.cron.reconcile({});
            clock.mockReturnValue(start + WEEK - 1);
            expect((await get('owner', id)).status).toBe(200);
            expect(await recentRows(await get('owner'))).toContainEqual(expect.objectContaining({ id }));
            const fresh = await ctx.fns.voice.journal.record(failure);
            clock.mockReturnValue(start + WEEK);
            expect((await get('owner', id)).status).toBe(404);
            expect(await recentRows(await get('owner'))).not.toContainEqual(expect.objectContaining({ id }));
            expect(await count(id)).toBe(1);
            clock.mockReturnValue(start + WEEK + 86400000);
            const due = await ctx.fns.cron.claim({});
            expect(due.fn).toBe('voice.journal.purge');
            expect((await ctx.fns.cron.runOne({ id: Number(due.id) })).status).toBe('done');
            expect(await count(id)).toBe(0);
            expect(await count(fresh)).toBe(1);
        } finally { clock.mockRestore(); }
    });
});
