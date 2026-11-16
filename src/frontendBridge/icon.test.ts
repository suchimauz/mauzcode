import { test, expect } from 'bun:test';
import iconData from './iconData';
import modelLogo from '../ui/modelLogo';
import modelMark from './modelMark';
const ctx: any = { fns: { models: { providers: () => [] }, procs: { ui: { escape: ({text}: {text:string}) => text } }, ui: { modelLogo: (opts: any) => modelLogo(ctx, null, opts) },
 frontendBridge: { modelMark: (opts: any) => modelMark(ctx, null, opts), declaredIcon: async ({icon}: any) => icon ? ({src:'data:image/svg+xml,'+icon,custom:false}) : null } } };
test('custom SVG wins over provider and stays an inert image URL', async () => {
 const svg='<svg viewBox="0 0 24 24"><path fill="red" d="M1 1"/></svg>';
 const result=await iconData(ctx as any,null,{icon:svg,model:'openai:gpt-4'});
 expect(result?.custom).toBe(true);expect(decodeURIComponent(result!.src)).toContain('fill="red"');expect(decodeURIComponent(result!.src)).toContain('xmlns="http://www.w3.org/2000/svg"');
});
test('fallback uses native provider resolution including SSH and MauzCode transport', async () => {
 const direct=await iconData(ctx as any,null,{model:'openai:gpt-4'});
 expect(direct?.custom).toBe(false);expect(direct?.src).toContain('data:image/svg+xml,');
 expect(await iconData(ctx as any,null,{model:'ssh/host:openai:gpt-4'})).toEqual(direct);
 expect(await iconData(ctx as any,null,{model:'mauzcode/host:openai:gpt-4'})).toEqual(direct);
 expect(await iconData(ctx as any,null,{model:'anthropic:claude'})).not.toEqual(direct);
 expect(await iconData(ctx as any,null,{model:'unknown:model'})).toEqual({src:'data:image/svg+xml,plug',custom:false});
 expect(await iconData(ctx as any,null,{})).toBeNull();
});
test('modelMark: model-id brand, then provider brand, then plug; same mark everywhere', async () => {
 const mark=(o:any)=>modelMark(ctx,null,o);
 const anthropic=await mark({provider:'claude'}),openai=await mark({provider:'codex'});
 expect(anthropic?.src).toContain('data:image/svg+xml,');expect(anthropic).not.toEqual(openai);
 expect(await mark({model:'claude/a:claude-opus-4-5'})).toEqual(anthropic);
 expect(await mark({model:'claude/a:some-alias'})).toEqual(anthropic);
 expect(await mark({model:'custom/Gate:claude-x'})).toEqual(anthropic);
 expect(await mark({model:'custom/Gate:gpt-5'})).toEqual(openai);
 const google=await mark({model:'custom/Gate:gemma4-26b'});
 expect(google?.src).not.toContain('plug');expect(google).not.toEqual(anthropic);
 expect(await mark({provider:'custom'})).toEqual({src:'data:image/svg+xml,plug',custom:false});
 expect(await mark({model:'custom/Gate:foo'})).toEqual({src:'data:image/svg+xml,plug',custom:false});
 expect(await mark({})).toBeNull();
});
