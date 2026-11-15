import { test, expect } from 'bun:test';
import get from './$route_new_GET';
const ctx: any = { fns: { projects: { get: async ({projectId}: any) => projectId === 'p' ? {id:'p'} : null }, agent: { createFromValues: async (values: any) => ({confirmation:{dir:'/missing',values}}) } } };
test('legacy creation GET preserves defaults and only redirects', async () => {
 const response = await get(ctx,null,{req:new Request('http://localhost/agent/new?popup=1&projectId=p&model=vendor%3Amodel&systemPrompt=hello')});
 const url = new URL(response.headers.get('location')!, 'http://localhost');
 expect(response.status).toBe(303); expect(url.searchParams.get('newSession')).toBe('1'); expect(url.searchParams.get('projectId')).toBe('p'); expect(url.searchParams.get('model')).toBe('vendor:model'); expect(url.searchParams.get('systemPrompt')).toBe('hello'); expect(url.searchParams.has('popup')).toBe(false);
 expect((await get(ctx,null,{req:new Request('http://localhost/agent/new?projectId=missing')})).status).toBe(404);
});
