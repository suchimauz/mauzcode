import { afterEach, expect, spyOn, test } from 'bun:test';
import resolve from './claudeClientVersion';
import detection from './claudeCliVersionDetection';
import validate from './claudeValidate';
import headers from './claudeWireHeaders';
import provider from '../../$modelProvider_claude';

let spawn: ReturnType<typeof spyOn> | undefined;
afterEach(() => spawn?.mockRestore());
function setup(config: Record<string, unknown> = {}) {
    let output = '2.1.260 (Claude Code)';
    const ctx: any = { env: { CLAUDE_CODE_CLI_VERSION: '9.9.9', CLAUDE_CODE_USER_AGENT: 'ignored' }, state: {}, fns: { models: { provider: { claude: {} } } } };
    Object.assign(ctx.fns.models.provider.claude, {
        claudeValidate: (opts: any) => validate(ctx, null, opts),
        claudeCliVersionDetection: (opts: any) => detection(ctx, null, opts),
        claudeClientVersion: (opts: any) => resolve(ctx, null, opts),
        claudeAuth: async () => ({ accessToken: 'test-token' }),
    });
    const conn: any = { config, transport: { kind: 'ssh-tunnel', instance: 'never-probed' } };
    spawn = spyOn(Bun, 'spawn').mockImplementation((() => ({ stdout: new Blob([output]).stream(), exited: Promise.resolve(0), kill() {} })) as any);
    return { ctx, conn, setOutput: (text: string) => { output = text; } };
}
test('Claude metadata defaults detection on and implements report hook', async () => {
    const { ctx, conn } = setup({ detectCliVersion: false });
    expect(provider.fields.find(f => f.key === 'detectCliVersion')).toMatchObject({ type: 'boolean', default: true });
    expect(await provider.clientVersion(ctx, conn, {})).toEqual({ version: '2.1.260', source: 'fallback' });
    expect(spawn).not.toHaveBeenCalled();
});
test('override exclusivity, legacy override, and invalid override validation', async () => {
    const { ctx, conn } = setup({ clientVersion: '2.0.0' });
    expect(() => validate(ctx, null, { config: conn.config })).not.toThrow();
    expect(await resolve(ctx, null, { conn, refresh: true })).toEqual({ version: '2.0.0', source: 'override' });
    conn.config.detectCliVersion = true;
    expect(() => validate(ctx, null, { config: conn.config })).toThrow('cannot be combined');
    await expect(resolve(ctx, null, { conn })).rejects.toThrow('cannot be combined');
    conn.config.detectCliVersion = false;
    for (const invalid of ['2.0 beta', ' 2.0.0 ', 'x'.repeat(41), '1\r\ninjected', 123, null]) {
        conn.config.clientVersion = invalid;
        expect(() => validate(ctx, null, { config: conn.config })).toThrow('Client version');
        await expect(resolve(ctx, null, { conn })).rejects.toThrow('Client version');
    }
    expect(spawn).not.toHaveBeenCalled();
});
test('all reported sources match messages, usage and compaction user agents; env ignored', async () => {
    for (const config of [{ clientVersion: '2.0.0' }, {}, { detectCliVersion: false }]) {
        const { ctx, conn } = setup(config);
        const report = await resolve(ctx, null, { conn });
        expect(report.source).toBe('clientVersion' in config ? 'override' : 'detectCliVersion' in config ? 'fallback' : 'detected');
        for (const flags of [{}, { usage: true }, { compact: true }]) {
            const h = await headers(ctx, null, { conn, ...flags });
            expect(h['user-agent']).toBe(`claude-cli/${report.version} (external, sdk-cli)`);
        }
        expect(spawn).toHaveBeenCalledTimes(report.source === 'detected' ? 1 : 0);
        if (report.source === 'detected') expect(spawn!.mock.calls[0]![0]).toEqual(['claude', '--version']);
        spawn!.mockRestore();
    }
});
test('cache retains detected source even at fallback version, shares in-flight probes, and refresh updates headers', async () => {
    const { ctx, conn, setOutput } = setup();
    const reports = await Promise.all(Array.from({ length: 5 }, () => resolve(ctx, null, { conn })));
    expect(reports).toEqual(Array(5).fill({ version: '2.1.260', source: 'detected' }));
    expect(spawn).toHaveBeenCalledTimes(1);
    const entry = ctx.state.models.claudeCliVersions.get('local');
    expect(entry.expires - Date.now()).toBeGreaterThan(290_000);
    setOutput('3.0.0');
    expect((await resolve(ctx, null, { conn })).version).toBe('2.1.260');
    expect(await resolve(ctx, null, { conn, refresh: true })).toEqual({ version: '3.0.0', source: 'detected' });
    expect((await headers(ctx, null, { conn }))['user-agent']).toContain('/3.0.0 ');
    expect(spawn).toHaveBeenCalledTimes(2);
});
test('failure cache expires after 30 seconds and refresh recovers', async () => {
    const { ctx, conn, setOutput } = setup();
    setOutput('not a version; private command output');
    expect(await resolve(ctx, null, { conn })).toEqual({ version: '2.1.260', source: 'fallback' });
    expect(await resolve(ctx, null, { conn })).toEqual({ version: '2.1.260', source: 'fallback' });
    expect(spawn).toHaveBeenCalledTimes(1);
    const entry = ctx.state.models.claudeCliVersions.get('local');
    expect(entry.expires - Date.now()).toBeLessThanOrEqual(30_000);
    entry.expires = Date.now() - 1;
    await resolve(ctx, null, { conn });
    expect(spawn).toHaveBeenCalledTimes(2);
    setOutput('4.0.0');
    expect(await resolve(ctx, null, { conn, refresh: true })).toEqual({ version: '4.0.0', source: 'detected' });
    expect(spawn).toHaveBeenCalledTimes(3);
});
