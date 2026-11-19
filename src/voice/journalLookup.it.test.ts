import { expect, test } from 'bun:test';
import { createSessionFixture } from './contract/sessionFixture.entry';

test('the owner can look up a failed fake-provider session by its displayed reference', async () => {
    const { ctx, route } = await createSessionFixture({ providerId: 'journal-fixture', openError: { code: 'providerAuth', message: 'private upstream detail' } });
    const origin = 'http://localhost';
    const owner = await ctx.fns.auth.createUser({ name: 'Journal fixture', email: 'journal@example.invalid', password: 'disposable-fixture-password' });
    const cookie = await ctx.fns.auth.issueSession({ user: owner, req: new Request(origin) });
    expect(Object.keys(ctx.state.procs.http.routes).filter(path => path.includes('errors'))).toContain('/api/voice/errors/:id');
    const get = (path: string) => ctx.fns.procs.http.handle({ req: new Request(origin + '/api/voice/errors' + path, { headers: { cookie } }) });
    const failure = await ctx.fns.voice.session.open({ route, onEvent() {} }).then(() => null, (e: unknown) => e);
    expect(failure.code).toBe('providerAuth');
    expect(failure.errorId).toMatch(/^[0-9a-f]{16}$/);
    const lookup = await get('/' + failure.errorId);
    expect([lookup.status, lookup.ok ? '' : await lookup.clone().text()]).toEqual([200, '']);
    const { error } = await lookup.json();
    expect(error).toEqual({ id: failure.errorId, provider: 'journal-fixture', model: 'fixture-live', stage: 'opening', cause: 'authentication', createdAt: expect.any(String) });
    expect(await (await get('')).json()).toEqual({ errors: [error] });
    expect((await get('/' + (failure.errorId === '0000000000000000' ? '1111111111111111' : '0000000000000000'))).status).toBe(404);
});
