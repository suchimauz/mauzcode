import {expect, spyOn, test} from 'bun:test';
import data from './modelData';
import catalogue from './modelCatalogue';
import effort from './modelEffort';
import icon from './iconData';
import mark from './modelMark';
import declared from './declaredIcon';
import modelLogo from '../ui/modelLogo';
import listModels from '../models/catalog/listModels';
import names from '../models/catalog/displayNames';
import prices from '../models/catalog/priceCatalog';

test('cold picker and missing route do not start provider, credential, label, icon or background pricing requests',async()=>{
  const external:string[]=[];
  const forbidden=(name:string)=>()=>{external.push(name);throw Error(name);};
  const fetch=spyOn(globalThis,'fetch').mockImplementation(Object.assign(forbidden('fetch'), {preconnect: forbidden('preconnect')}));
  const view={id:'1',provider:'example',accountName:'local',enabled:true,providerRegistered:true,disabledModels:[],config:{models:['plain-model']}};
  const definition={id:'example',icon:'plug',listModels:forbidden('discovery')};
  const ctx:any={state:{models:{providers:{example:{definition}}}},fns:{
    procs:{ui:{escape:({text}:{text:string})=>text},db:{select:async({sql}:any)=>sql.includes('FROM agents')?[{id:'chat',model:'codex/missing:new-model',reasoning_effort:'auto'}]:[]}},
    settings:{modelDefault:forbidden('route discovery')},
  }};
  const bind=(fn:Function)=>(opts:unknown)=>fn(ctx,null,opts);
  ctx.fns.models={providers:()=>[definition],list:async()=>[view],disabledProviders:async()=>new Set(),listModels:bind(listModels),displayNames:bind(names),catalog:{priceCatalog:bind(prices)},connections:{get:async()=>view,resolve:forbidden('credential resolution')}};
  ctx.fns.ui={modelLogo:bind(modelLogo)};
  ctx.fns.frontendBridge={modelCatalogue:bind(catalogue),modelEffort:bind(effort),iconData:bind(icon),modelMark:bind(mark),declaredIcon:bind(declared)};
  try{
    const result=await data(ctx,{user:{id:'owner'}} as any,{agentId:'chat'});
    expect(result.model).toBe('codex/missing:new-model');expect(result.label).toBe('New Model');
    expect(result.models).toMatchObject([{model:'example/local:plain-model',label:'Plain Model'}]);
    expect(result.icon?.src).toStartWith('data:image/'); expect(result.models[0]?.icon?.src).toStartWith('data:image/');
    expect(ctx.state.modelsPriceCatalog).toBeUndefined();expect(external).toEqual([]);
  }finally{fetch.mockRestore();}
});
