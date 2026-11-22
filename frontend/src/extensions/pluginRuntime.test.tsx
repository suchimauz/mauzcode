import { describe, expect, it, vi } from 'vitest';
import { createPluginRuntime, type PluginUiManifest } from './pluginRuntime';
import type { UiExtension } from './types';

const page = (id: string): UiExtension => ({ id, apiVersion: 1, pages: [{ id: 'overview', title: id, component: () => null }] });
const entry = (name: string, hash: string) => ({ name, hash, url: `/plugins/ui/${name}/${hash}.js`, grants: { pages: ['overview'] }, applications: { [`/${name}`]: 'overview' } });

describe('runtime plugin UI registry', () => {
  it('loads approved bundles dynamically, hot-replaces on a new hash and removes plugins', async () => {
    let manifest: PluginUiManifest = { apiVersion: 1, plugins: [entry('alpha', 'a'.repeat(16))] };
    const importer = vi.fn(async (url: string) => ({ default: { ...page('alpha'), pages: [{ id: 'overview', title: url, component: () => null }] } }));
    const runtime = createPluginRuntime({ importer, fetchManifest: async () => manifest });
    const listener = vi.fn(); runtime.subscribe(listener);
    let state = await runtime.refresh();
    expect(state.registry.pages.map(p => p.key)).toContain('alpha/overview');
    expect(state.applications['/alpha']).toBe('alpha/overview');
    await runtime.refresh(); expect(importer).toHaveBeenCalledTimes(1); // cached by hash
    manifest = { apiVersion: 1, plugins: [entry('alpha', 'b'.repeat(16))] };
    state = await runtime.refresh();
    expect(importer).toHaveBeenCalledTimes(2);
    expect(state.registry.pages.find(p => p.key === 'alpha/overview')?.title).toBe(`/plugins/ui/alpha/${'b'.repeat(16)}.js`);
    manifest = { apiVersion: 1, plugins: [] };
    state = await runtime.refresh();
    expect(state.registry.pages.some(p => p.key.startsWith('alpha/'))).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it('isolates broken plugins and rejects id mismatch, core override and ungranted surfaces', async () => {
    const modules: Record<string, unknown> = { good: page('good'), wrong: page('other'), settings: page('settings'), boom: null, greedy: { ...page('greedy'), canvasKinds: [{ kind: 'greedy.x', component: () => null }] } };
    const runtime = createPluginRuntime({
      importer: async url => { const name = url.split('/')[3]!; if (name === 'boom') throw new Error('syntax error'); return { default: modules[name] }; },
      fetchManifest: async () => ({ apiVersion: 1, plugins: ['good', 'wrong', 'settings', 'boom', 'greedy'].map(n => entry(n, 'c'.repeat(16))) }),
    });
    const state = await runtime.refresh();
    expect(state.registry.pages.map(p => p.key)).toContain('good/overview');
    expect(state.registry.pages.map(p => p.key)).toContain('settings/overview');
    expect(Object.keys(state.errors).sort()).toEqual(['boom', 'settings', 'wrong']);
    expect(state.registry.canvasKinds.some(k => k.kind === 'greedy.x')).toBe(false); // ungranted surface never reaches a slot
    expect(state.errors.boom).toMatch(/syntax error/);
  });

  it('keeps core surfaces when the manifest is unavailable', async () => {
    const runtime = createPluginRuntime({ importer: vi.fn(), fetchManifest: async () => { throw new Error('offline'); } });
    const state = await runtime.refresh();
    expect(state.loaded).toBe(true);
    expect(state.errors.manifest).toBe('offline');
    expect(state.registry.pages.map(p => p.key)).toContain('documentation/search');
  });
});

it('inputKinds survive approved manifest grants and disappear when approval is absent', async () => {
 const extension: UiExtension = {id:'alpha',apiVersion:1,inputKinds:[{kind:'alpha-review',component:()=>null}]};
 let manifest: PluginUiManifest = {apiVersion:1,plugins:[{...entry('alpha','a'.repeat(16)),grants:{inputKinds:['alpha-review']}}]};
 const importer=vi.fn(async()=>({default:extension}));
 const runtime=createPluginRuntime({importer,fetchManifest:async()=>manifest});
 expect((await runtime.refresh()).registry.inputKinds.map(k=>k.kind)).toEqual(['alpha-review']);
 manifest={apiVersion:1,plugins:[]};
 expect((await runtime.refresh()).registry.inputKinds).toHaveLength(0);
 expect(importer).toHaveBeenCalledTimes(1);
});

describe('plugin UI recovery after transient failures', () => {
  const timers = () => {
    const pending: Array<{ run: () => void; ms: number; id: number }> = []; let next = 0;
    const retry = { random: () => 0, setTimer: (run: () => void, ms: number) => { const id = ++next; pending.push({ run, ms, id }); return id; }, clearTimer: (id: unknown) => { const i = pending.findIndex(t => t.id === id); if (i >= 0) pending.splice(i, 1); } };
    const fire = async () => { const t = pending.shift(); t?.run(); await new Promise(r => setTimeout(r, 0)); return t; };
    return { pending, retry, fire };
  };

  it('retries a failed manifest with growing, capped backoff and keeps the last registry', async () => {
    const clock = timers();
    let fails = 0;
    const fetchManifest = vi.fn(async () => { if (fails-- > 0) throw new Error('server restarting'); return { apiVersion: 1 as const, plugins: [entry('alpha', 'a'.repeat(16))] }; });
    const runtime = createPluginRuntime({ importer: async () => ({ default: page('alpha') }), fetchManifest, retry: { ...clock.retry, baseMs: 1000, maxMs: 4000 } });
    expect((await runtime.refresh()).registry.pages.map(p => p.key)).toContain('alpha/overview');
    expect(clock.pending).toHaveLength(0);
    fails = 4;
    const failed = await runtime.refresh();
    expect(failed.errors.manifest).toBe('server restarting');
    expect(failed.registry.pages.map(p => p.key)).toContain('alpha/overview'); // last good registry kept
    const delays: number[] = [];
    for (let i = 0; i < 4; i++) { delays.push(clock.pending[0]!.ms); await clock.fire(); }
    expect(delays).toEqual([1000, 2000, 4000, 4000]);
    expect(fetchManifest).toHaveBeenCalledTimes(6);
    expect(clock.pending).toHaveLength(0);
    expect(runtime.getState().errors.manifest).toBeUndefined();
    await runtime.refresh(); fails = 1; await runtime.refresh();
    expect(clock.pending[0]!.ms).toBe(1000); // backoff reset after success
  });

  it('does not retry auth failures', async () => {
    const clock = timers();
    const runtime = createPluginRuntime({ importer: vi.fn(), fetchManifest: async () => { throw Object.assign(new Error('Unauthorized'), { status: 401 }); }, retry: clock.retry });
    await runtime.refresh();
    expect(clock.pending).toHaveLength(0);
  });

  it('retries a bundle download failure but not a validation failure', async () => {
    const clock = timers();
    let boom = true;
    const importer = vi.fn(async (url: string) => {
      const name = url.split('/')[3]!;
      if (name === 'flaky' && boom) { boom = false; throw new TypeError('Failed to fetch dynamically imported module'); }
      return { default: page(name === 'wrong' ? 'other' : name) };
    });
    const runtime = createPluginRuntime({ importer, fetchManifest: async () => ({ apiVersion: 1, plugins: [entry('flaky', 'd'.repeat(16)), entry('wrong', 'e'.repeat(16))] }), retry: clock.retry });
    const first = await runtime.refresh();
    expect(Object.keys(first.errors).sort()).toEqual(['flaky', 'wrong']);
    expect(clock.pending).toHaveLength(1);
    await clock.fire();
    const state = runtime.getState();
    expect(state.registry.pages.map(p => p.key)).toContain('flaky/overview');
    expect(Object.keys(state.errors)).toEqual(['wrong']);
    expect(importer.mock.calls.some(([url]) => url.endsWith('?retry=1'))).toBe(true); // cache-busted retry
    expect(clock.pending).toHaveLength(0); // validation failure alone schedules nothing
  });

  it('an immediate refresh cancels the pending retry and stop prevents further requests', async () => {
    const clock = timers();
    const fetchManifest = vi.fn(async () => { throw new Error('offline'); });
    const runtime = createPluginRuntime({ importer: vi.fn(), fetchManifest, retry: clock.retry });
    await runtime.refresh();
    expect(clock.pending).toHaveLength(1);
    await runtime.refresh(); // e.g. live resync during backoff
    expect(clock.pending).toHaveLength(1); // still a single retry chain
    runtime.stop();
    expect(clock.pending).toHaveLength(0);
    await runtime.refresh();
    expect(clock.pending).toHaveLength(0);
    expect(fetchManifest).toHaveBeenCalledTimes(3);
  });
});

it('coming back online refreshes at once while a retry is pending', async () => {
  const pending: unknown[] = [];
  let fail = true;
  const fetchManifest = vi.fn(async () => { if (fail) throw new Error('offline'); return { apiVersion: 1 as const, plugins: [] }; });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const runtime = createPluginRuntime({ importer: vi.fn(), fetchManifest, retry: { setTimer: run => { pending.push(run); return pending.length; }, clearTimer: () => { pending.length = 0; } } });
  runtime.start();
  await vi.waitFor(() => expect(runtime.getState().errors.manifest).toBe('offline'));
  fail = false;
  window.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(runtime.getState().errors.manifest).toBeUndefined());
  expect(fetchManifest).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event('online')); // no retry pending: ignored
  expect(fetchManifest).toHaveBeenCalledTimes(2);
  runtime.stop(); warn.mockRestore();
});
