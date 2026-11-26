import { afterEach, expect, it, vi } from 'vitest';
import { effortAfterSwitch, getDraftModelSettings, normalizeEffort } from '../lib/models';
import { rememberSessionSelection } from '../lib/newSession';
afterEach(()=>{vi.unstubAllGlobals(); localStorage.clear();});
const config = {model:'default',defaultModel:'default',label:'Default',icon:null,models:['first','default','remembered'].map(model=>({model,label:model,provider:'test',disabled:false,icon:null})),effort:{requested:'auto',applied:'medium',supported:['auto','low','medium','high'],mode:'openai-effort'}};
it('uses remembered available model, but first enabled when a removed model is remembered', async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{const model=new URL(url,'http://test').searchParams.get('model')||'default';return Response.json({...config,model});}));
 rememberSessionSelection({model:'remembered'});
 expect((await getDraftModelSettings('','high')).model).toBe('remembered');
 rememberSessionSelection({model:'gone'});
 const restored=await getDraftModelSettings('gone','xhigh');
 expect(restored.model).toBe('first');expect(restored.effort.requested).toBe('auto');
 expect((await getDraftModelSettings('default','low')).effort.requested).toBe('low');
});
it('never silently downgrades unsupported draft effort to another explicit level',()=>{
 expect(normalizeEffort('xhigh',['auto','low','high'])).toBe('auto');
 expect(normalizeEffort('',['auto','low'])).toBe('auto');
 expect(normalizeEffort('high',['auto','high'])).toBe('high');
});
it('a replaced unavailable draft route starts at Default even when the replacement supports the old level', async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{const model=new URL(url,'http://test').searchParams.get('model')||'default';return Response.json({...config,model});}));
 const replaced=await getDraftModelSettings('removed','high');
 expect(replaced.model).toBe('first');expect(replaced.effort.requested).toBe('auto');
 // Reloading the replaced draft does not resurrect the old preference.
 expect((await getDraftModelSettings(replaced.model,replaced.effort.requested)).effort.requested).toBe('auto');
 // Restoring the same available route keeps a supported explicit choice.
 expect((await getDraftModelSettings('default','high')).effort.requested).toBe('high');
});
it('restoring a legacy alias of the same canonical route keeps the effort', async()=>{
 const aliased={...config,model:'test/default:m',defaultModel:'test/default:m',models:[{model:'test/default:m',label:'m',provider:'test',disabled:false,icon:null}]};
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(aliased)));
 const restored=await getDraftModelSettings('test:m','high');
 expect(restored.model).toBe('test/default:m');expect(restored.effort.requested).toBe('high');
});
it('an explicit switch resets to Default unless only the connection changes', ()=>{
 expect(effortAfterSwitch('codex/work:gpt-6','codex/home:gpt-6','high')).toBe('high');
 expect(effortAfterSwitch('codex/work:gpt-6','codex/work:gpt-6-mini','high')).toBe('auto');
 expect(effortAfterSwitch('codex/work:gpt-6','claude/work:gpt-6','high')).toBe('auto');
 expect(effortAfterSwitch('ssh/a:codex/work:gpt-6','codex/work:gpt-6','high')).toBe('auto');
 expect(effortAfterSwitch('','codex/work:gpt-6','high')).toBe('auto');
 // The target catalogue then drops a level it does not list (or when it lists none).
 expect(normalizeEffort(effortAfterSwitch('codex/work:gpt-6','codex/home:gpt-6','high'),['auto','low'])).toBe('auto');
 expect(normalizeEffort(effortAfterSwitch('codex/work:gpt-6','codex/home:gpt-6','high'),[])).toBe('auto');
});
