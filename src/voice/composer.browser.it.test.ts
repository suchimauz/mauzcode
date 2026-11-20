// Actual Chromium → LiveComposer/AudioWorklet → authenticated application WS → real adapter → fake Realtime.
// No worker, working runtime, developer browser, microphone, external service or persisted recording.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { mkModelsTestCtx } from '../agent/modelsTestCtx.entry';
import { testDatabaseUrl } from '../$test';
import { makeRequestCtx } from '../procs/boot/requestCtx';
import { confirmSetup, startFakeRealtime, committed, transcription, type FakeConnection } from './contract/openaiRealtimeFake.entry';
import { browserTestsEnabled, startHeadlessChrome, type HeadlessChrome } from '../../test/chrome/headless';
import { openVoiceTab } from '../../test/chrome/voice-tab';

const KEY = 'fake-voice-e2e-server-only-129dee';
const root = resolve(import.meta.dir, '../..');
// Explicit opt-out for hosts without the fixtures; missing/broken setup otherwise fails the run.
// Chrome runs from the pinned Docker image (test/chrome/headless.ts): without Docker the suite is skipped.
const skipFixture = !(await browserTestsEnabled());
let chrome: HeadlessChrome | null;
let bundle: Blob;
let css: Blob | undefined;
beforeAll(async () => {
  if (skipFixture) return;
  // This suite requires the shipped disposable DB, never a custom remote or working DB.
  const db = new URL(testDatabaseUrl(process.env));
  if (db.hostname !== '127.0.0.1' || db.port !== '54399') throw new Error('Expected disposable Postgres on 127.0.0.1:54399');
  chrome = await startHeadlessChrome();
  if (!chrome) throw new Error('test Chrome container did not start (see test/chrome/headless.ts)');
  const build = await Bun.build({ entrypoints: [join(root, 'test/chrome/voice-composer.fixture.tsx')], target: 'browser', tsconfig: join(root, 'frontend/tsconfig.json') });
  if (!build.success) throw new Error(build.logs.join('\n'));
  bundle = build.outputs.find(asset => asset.path.endsWith('.js'))!;
  css = build.outputs.find(asset => asset.path.endsWith('.css'));
}, 20000);
afterAll(async () => { await chrome?.stop(); });

// Compare all files (not merely known audio extensions) at persistence checkpoints, including uploads/blobs.
async function files(dir: string): Promise<string[]> {
  const paths = await readdir(dir, { recursive: true });
  return (await Promise.all(paths.map(async path => { const s = await stat(join(dir, path)); return s.isFile() ? `${path}:${s.size}:${s.mtimeMs}` : ''; }))).filter(Boolean).sort();
}

for (const mode of ['inline', 'panel'] as const) test.skipIf(skipFixture)(`${mode}: real capture and finalization never submit until requested`, async () => {
  const tmp = join(root, '.test-tmp'); await mkdir(tmp, { recursive: true });
  const dir = await mkdtemp(join(tmp, 'voice-composer-'));
  const upstream = startFakeRealtime();
  let server: ReturnType<typeof Bun.serve> | undefined;
  let tab: Awaited<ReturnType<typeof openVoiceTab>> | undefined;
  try {
    const ctx = await mkModelsTestCtx();
    ctx.env.WORKDIR = dir; ctx.state.root = dir;
    ctx.env.MAUZCODE_OAUTH_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString('base64');
    const user = await ctx.fns.auth.createUser({ name: 'Voice fixture', email: 'voice@example.invalid', password: 'disposable-voice-fixture-password' });
    const agent = await makeRequestCtx(ctx, { user }).fns.agent.start({ model: 'mock/default:test', workspaceDir: dir });
    expect(agent.createdBy).toBe(user.id);
    // Model an already busy chat without starting any worker or model call.
    await ctx.fns.procs.db.run({ sql: "UPDATE agents SET run_state='running', run_token=? WHERE id=?", params: ['fixture', agent.id] });
    await ctx.fns.voice.create({ provider: 'openai-realtime', accountName: 'loopback', config: { baseUrl: upstream.baseUrl }, secrets: { apiKey: KEY } });
    await ctx.fns.settings.set({ module: 'voice', key: 'defaultRoute', scopeType: 'global', value: 'openai-realtime/loopback:gpt-live-transcribe' });
    const base = `/agent/${agent.id}`;
    const gets = new Set(['/voice/api', '/commands', ...['queue', 'todos', 'triggers', 'persistent-goal'].map(s => `${base}/${s}`)]);
    let cookie = '', posts = 0, leaked = false;
    const unexpected: string[] = [];
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: ctx.fns.procs.http.socketHandlers({}), async fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === '/' && req.method === 'GET') return new Response('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/composer.css"><div id="root"></div><script type="module" src="/composer.js"></script>', { headers: {
        'Content-Type': 'text/html', 'Set-Cookie': cookie, 'Cache-Control': 'no-store', 'Permissions-Policy': 'microphone=()',
        'Content-Security-Policy': `default-src 'none'; script-src 'self' blob:; worker-src blob:; connect-src 'self' ws://${url.host}; style-src 'self' 'unsafe-inline'; img-src data:`,
      } });
      if (url.pathname === '/composer.css') return new Response(css, { headers: { 'Content-Type': 'text/css' } });
      if (url.pathname === '/composer.js') return new Response(bundle, { headers: { 'Content-Type': 'text/javascript' } });
      if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
      // Inert model-picker/context badges: never query a model catalogue or inference service.
      if (req.method === 'GET' && url.pathname === '/ui-lab-api/models') return Response.json({ agentId: agent.id, model: agent.model, label: 'Mock', icon: null, models: [], effort: { requested: 'auto', applied: 'auto', supported: [], mode: 'auto' } });
      if (req.method === 'GET' && url.pathname === `/api/v1/agents/${agent.id}/context`) return Response.json({ budget: null });
      const queuePost = req.method === 'POST' && url.pathname === `${base}/queue`;
      if (!(queuePost || (req.method === 'GET' && (gets.has(url.pathname) || url.pathname === '/voice/session')))) {
        unexpected.push(`${req.method} ${url.pathname}`); return new Response(null, { status: 404 });
      }
      if (queuePost) posts++;
      const res = await ctx.fns.procs.http.handle({ req, server: srv });
      if (res) leaked ||= (await res.clone().text()).includes(KEY);
      return res;
    } });
    const origin = `http://127.0.0.1:${server.port}`;
    cookie = await ctx.fns.auth.issueSession({ user, req: new Request(origin) });
    const anonymous = await fetch(origin + '/voice/session', { redirect: 'manual', headers: { upgrade: 'websocket', connection: 'Upgrade', origin, 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-version': '13' } });
    expect(anonymous.status).toBe(401);
    const initialFiles = await files(dir);
    const rows = (sql: string) => ctx.fns.procs.db.select({ sql, params: [agent.id] });
    const checkpoint = async (queued: string[] = []) => {
      expect(await rows('SELECT role FROM messages WHERE agent_id=?')).toEqual([]);
      expect(await rows('SELECT text,status,files FROM agent_turn_queue WHERE agent_id=? ORDER BY sequence')).toEqual(queued.map(text => ({ text, status: 'pending', files: [] })));
      expect(await rows('SELECT id FROM attachments WHERE agent_id=?')).toEqual([]);
      expect(posts).toBe(queued.length);
      expect(await files(dir)).toEqual(initialFiles);
    };
    const page = tab = await openVoiceTab(chrome!, KEY);
    await page.command('Page.navigate', { url: `${origin}/?agent=${encodeURIComponent(agent.id)}` });
    const entry = `document.querySelector('[data-mode="${mode}"]')`;
    const editor = `document.querySelector('[role="textbox"]')`;
    const panel = `document.querySelector('.voice-panel')`;
    const privacy = async () => {
      expect(leaked || page.leaked()).toBe(false);
      expect((await page.evaluate(`JSON.stringify([document.documentElement.outerHTML, localStorage, sessionStorage])`)).includes(KEY)).toBe(false);
    };
    await page.wait(`${entry} && !${entry}.hasAttribute('aria-disabled')`);
    if (mode === 'inline') {
      await page.evaluate(`${editor}.focus()`);
      await page.command('Input.insertText', { text: 'left right' });
      await page.evaluate(`getSelection().collapse(${editor}.firstChild, 5); ${editor}.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true,key:'ArrowLeft'}))`);
    }
    await page.evaluate(`${entry}.click()`);
    // Require non-silent PCM to travel through the actual capture path *before* scripting a transcript.
    const tone = async (conn: FakeConnection, after = 0) => {
      // Chromium can begin with silence while its two audio graphs synchronize. Wait for the
      // generated 440 Hz tone (about 8–9 rising zero crossings per 20 ms at the negotiated 24 kHz).
      let tone = false;
      for (let n = after + 1; !tone && n <= after + 100; n++) {
        await conn.waitReceived('input_audio_buffer.append', n);
        const pcm = Buffer.from(conn.received.filter(p => p.type === 'input_audio_buffer.append')[n - 1]!.audio, 'base64');
        let crossings = 0;
        for (let i = 2; i < pcm.length; i += 2) if (pcm.readInt16LE(i - 2) <= 0 && pcm.readInt16LE(i) > 0) crossings++;
        const hz = crossings * 24000 / (pcm.length / 2);
        tone = hz >= 380 && hz <= 500;
      }
      expect(tone).toBe(true);
    };
    const audio = async (index: number) => {
      const conn = await confirmSetup(upstream, index);
      expect(conn.authorization === `Bearer ${KEY}`).toBe(true);
      await tone(conn);
      await checkpoint(); await privacy();
      return conn;
    };
    const revise = async (conn: FakeConnection, n = 1) => {
      await conn.waitReceived('input_audio_buffer.commit', n);
      await conn.send(committed(`item_${n}`, n > 1 ? `item_${n - 1}` : null));
      await conn.send(transcription('delta', `item_${n}`, { delta: 'pending' }));
      await page.wait(`${mode === 'inline' ? editor : panel}.textContent.includes('pending')`);
      await checkpoint(); await privacy();
    };
    const finish = (conn: FakeConnection, text: string, n = 1) => conn.send(transcription('completed', `item_${n}`, { transcript: text }));
    const first = await audio(0);
    if (mode === 'inline') {
      await page.evaluate(`window.dispatchEvent(new CustomEvent('fixture:tone', {detail:false}))`);
      await revise(first); await finish(first, 'middle');
      await page.wait(`${editor}.textContent === 'left middle right' && ${entry}.getAttribute('aria-pressed') === 'true'`);
      await checkpoint();
      const offset = first.received.filter(p => p.type === 'input_audio_buffer.append').length;
      await page.evaluate(`window.dispatchEvent(new CustomEvent('fixture:tone', {detail:true}))`);
      await tone(first, offset);
      await page.evaluate(`${entry}.click()`); await revise(first, 2); await finish(first, 'last', 2);
      await page.wait(`${editor}.textContent === 'left middle last right' && ${entry}.getAttribute('aria-pressed') === 'false'`);
      await checkpoint();
    } else {
      const toggle = `${panel}.querySelector('[aria-keyshortcuts="Space"]')`;
      await page.evaluate(`${toggle}.click()`); await revise(first); await finish(first, 'first');
      await page.wait(`${panel}.dataset.state === 'paused' && ${panel}.querySelector('.voice-panel-transcript').textContent === 'first'`);
      await checkpoint();
      await page.evaluate(`${toggle}.click()`);
      const second = await audio(1);
      // Two rapid explicit gestures must join the in-flight finalization, not queue twice.
      await page.evaluate(`{ const send = ${panel}.querySelector('[aria-keyshortcuts="Enter"]'); send.click(); send.click(); }`);
      await revise(second); await finish(second, 'last');
      await page.wait(`document.body.dataset.accepted === '1' && ${panel}.dataset.state === 'paused'`);
      await checkpoint(['first last']);
    }
    const count = mode === 'inline' ? 1 : 2;
    expect(page.sockets).toEqual(Array(count).fill(origin.replace('http:', 'ws:') + '/voice/session'));
    expect(page.frames.filter(f => f.sent && f.type !== 'pcm').map(f => f.type)).toEqual(Array.from({ length: count }, () => ['start', 'finish']).flat());
    expect(page.frames.some(f => f.sent && f.type === 'pcm')).toBe(true);
    expect(page.frames.filter(f => !f.sent && f.type === 'completed')).toHaveLength(count);
    expect(upstream.connections).toHaveLength(count);
    await privacy(); expect(unexpected).toEqual([]);
  } finally { try { await tab?.close(); } finally { server?.stop(true); upstream.stop(); await rm(dir, { recursive: true, force: true }); } }
}, 60000);
