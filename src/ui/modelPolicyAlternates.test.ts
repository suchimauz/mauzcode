import { expect, test } from 'bun:test';
import mobileOptions from '../api/$route_v1_new-agent-options_GET';
import button from '../procs/ui/button';
import escape from '../procs/ui/escape';
import attr from '../procs/ui/attr';

const renderCtx = async (): Promise<any> => {
  const ctx: any = { fns: { ui: {}, procs: { ui: {} } } };
  for (const [name, fn] of Object.entries({ button, escape, attr })) ctx.fns.procs.ui[name] = (opts: any) => fn(ctx, null, opts as never);
  return ctx;
};

const model = 'openai:gpt-5';
const alias = 'openai/default:gpt-5';
const named = 'openai/work:gpt-5';

test('mobile options use the connection catalogue and choose an enabled default or empty', async () => {
  const entry = (model: string, disabled: boolean) => ({ provider: 'custom', model, label: model.slice(model.indexOf(':') + 1), groupLabel: 'work', connectionId: 'c', disabled });
  let models = [entry('custom/work:a', true), entry('custom/work:b', false)];
  const ctx: any = { fns: { frontendBridge: { modelCatalogue: async () => ({ groups: [{ connectionId: 'c', provider: 'custom', accountName: 'work', enabled: true, unavailable: false }], models }) }, settings: { modelDefault: async () => 'custom/work:a' }, session: { list: async () => [] } } };
  let result = await (await mobileOptions(ctx, null, { req: new Request('http://localhost'), params: {} })).json();
  expect(result.defaultModel).toBe('custom/work:b');
  expect(result.models).toEqual([{ provider: 'custom', model: 'custom/work:a', label: 'a', groupLabel: 'work', disabled: true }, { provider: 'custom', model: 'custom/work:b', label: 'b', groupLabel: 'work', disabled: false }]);
  expect(result.groups).toHaveLength(1);
  models = [entry('custom/work:a', true)];
  ctx.fns.settings.modelDefault = async () => { throw Object.assign(new Error('none'), { code: 'NO_MODEL' }); };
  result = await (await mobileOptions(ctx, null, { req: new Request('http://localhost'), params: {} })).json();
  expect(result.defaultModel).toBe('');
});
