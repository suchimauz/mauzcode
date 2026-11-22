import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mkTestCtx } from '../_testCtx.entry';

test('a mounted plugin command hot-reloads in the catalogue and runs the new template over HTTP', async () => {
    const scratch = resolve(import.meta.dir, '../../.test-tmp');
    await mkdir(scratch, { recursive: true });
    const root = await mkdtemp(join(scratch, 'command-reload-'));
    try {
        const plugins = join(root, 'plugins');
        const plugin = join(plugins, 'fixture');
        const rel = 'fixture/$command_x.ts';
        const file = join(plugin, 'src', rel);
        const declare = (label: string, template: string) => Bun.write(file, `export default ${JSON.stringify({
            kind: 'prompt', label, description: 'Fixture prompt', template, icon: 'compass', section: 'expeditions',
        })};\n`);
        await Bun.write(join(plugin, 'package.json'), JSON.stringify({ name: 'fixture', procs: { src: 'src' } }));
        await Bun.write(join(plugin, 'src/fixture/$commandSection_expeditions.json'), JSON.stringify({ label: 'Expeditions', order: 41 }));
        await declare('Original prompt', 'Original: {{args}}');

        const ctx = await mkTestCtx({ env: { USER_PLUGINS: plugins, PROCS_PLUGINS: '', PROCS_PATH: join(root, 'no-extra-modules'), PROCS_IGNORE_WORKSPACE: '1' } });
        const agent = await ctx.fns.agent.start({ model: 'mock:test', workspaceDir: root });
        const origin = 'http://localhost';
        const user = await ctx.fns.auth.createUser({ name: 'Fixture', email: 'fixture@example.invalid', password: 'disposable-fixture-password' });
        const cookie = await ctx.fns.auth.issueSession({ user, req: new Request(origin) });
        const catalogue = async () => {
            const req = new Request(`${origin}/commands?version=2&agentId=${agent.id}`, { headers: { cookie } });
            const response = await ctx.fns.procs.http.handle({ req });
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.version).toBe(2);
            expect(data.sections).toContainEqual(expect.objectContaining({ id: 'expeditions', label: 'Expeditions', order: 41 }));
            const matches = data.commands.filter((cmd: { name: string }) => cmd.name === 'fixture:x');
            expect(matches).toHaveLength(1);
            expect(matches[0]).toMatchObject({ kind: 'prompt', section: 'expeditions', icon: 'compass', enabled: true });
            return { command: matches[0], csrfToken: data.csrfToken };
        };
        expect((await catalogue()).command.label).toBe('Original prompt');
        await declare('Updated prompt', 'Updated: {{args}}');
        await ctx.fns.procs.dev.sync({ rel });
        const { command, csrfToken } = await catalogue();
        expect(command.label).toBe('Updated prompt');

        const text = '/fixture:x north and west';
        const response = await ctx.fns.procs.http.handle({ req: new Request(`${origin}/agent/${agent.id}/commands`, {
            method: 'POST', headers: { cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ text, requestId: 'plugin-reload' }),
        }) });
        expect(response.ok).toBe(true);
        expect(await response.json()).toMatchObject({ command: 'fixture:x' });
        const messages = await ctx.fns.session.getMessages({ id: agent.id });
        expect(messages.filter((row: { role: string }) => row.role === 'user')).toEqual([
            expect.objectContaining({ content: 'Updated: north and west' }),
        ]);
        const events = await ctx.fns.session.getEvents({ id: agent.id });
        expect(events).toContainEqual(expect.objectContaining({ type: 'user', command: expect.objectContaining({ text }) }));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}, 60_000);
