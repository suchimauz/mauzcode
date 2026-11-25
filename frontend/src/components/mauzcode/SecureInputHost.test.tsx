import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { requestJson } from '../../lib/mauzcode';
import { SecureInputHost } from './SecureInputHost';
vi.mock('../../lib/mauzcode', () => ({ requestJson: vi.fn(async () => ({ inputs: [{id:'s',kind:'secret',title:'Secret',message:'Paste key',saveAs:'secret://test/demo',mode:'password'},{id:'t',kind:'redmine-time',title:'Time'},{id:'r',kind:'redmine-approval',title:'Approve'}] })) }));
afterEach(cleanup);
test('secret renders a native card; only the value field is an isolated frame', async () => {
 const {container}=render(<SecureInputHost agentId="a" />);
 const card=await screen.findByRole('region',{name:'Secret'});
 expect(card.className).toContain('question-card');
 expect(screen.getByText('Paste key')).toBeTruthy();
 expect(screen.getByText('secret://test/demo')).toBeTruthy();
 const frame=card.querySelector('iframe')!;
 expect(frame.getAttribute('src')).toBe('/input/compat?agentId=a&id=s&theme=light&view=field');
 expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-same-origin');
 expect(frame.hasAttribute('srcdoc')).toBe(false);
 const save=screen.getByRole('button',{name:'Сохранить'}) as HTMLButtonElement;
 expect(save.disabled).toBe(true);
 window.dispatchEvent(new MessageEvent('message',{origin:'http://evil',data:{source:'mauzcode-secret',id:'s',state:'ready'}}));
 expect(save.disabled).toBe(true);
 expect(container.querySelectorAll('iframe')).toHaveLength(1);
});
test('other secure kinds open after click; approval uses top-level protected page', async () => {
 const {container}=render(<SecureInputHost agentId="a" />);
 const button=await screen.findByRole('button',{name:/Time/});
 expect(container.querySelectorAll('iframe')).toHaveLength(1);
 fireEvent.click(button);
 const frames=[...container.querySelectorAll('iframe')].map(f=>f.getAttribute('src'));
 expect(frames).toContain('/input/compat?agentId=a&id=t&theme=light');
 const link=screen.getByRole('link');expect(link.getAttribute('target')).toBe('_blank');expect(link.getAttribute('href')).toContain('id=r');
});

test('unapproved arbitrary plugin has visible safe fallback; core native kinds are not duplicated', async () => {
 vi.mocked(requestJson).mockResolvedValueOnce({ inputs: [{id:'x',kind:'example-review',title:'Plugin review'}, ...['choice','confirm','grid','planning-review'].map(kind=>({id:kind,kind,title:kind}))] } as never);
 render(<SecureInputHost agentId="a" />);
 fireEvent.click(await screen.findByRole('button',{name:/Plugin review/}));
 expect(screen.getByTitle('Plugin review').getAttribute('src')).toContain('id=x');
 expect(screen.getByText(/восстановите её плагин/)).toBeTruthy();
 expect(screen.queryByText(/Ожидают ответа или обработки/)).toBeNull();
 for(const kind of ['choice','confirm','grid','planning-review']) expect(screen.queryByRole('button',{name:new RegExp(kind)})).toBeNull();
});

test('skill review renders a native card and posts the shown digest with CSRF', async () => {
 vi.mocked(requestJson).mockImplementation((async (path: string, init?: { method?: string }) => {
  if (path.startsWith('/input/compat')) return { inputs: [{ id: 'k', kind: 'skill-review', title: 'Add skill skill.workspace:review' }] };
  if (init?.method === 'POST') return { ok: true, status: 'published', reason: 'published' };
  return { id: 'k', state: 'open', title: 'Add skill', message: 'Review exactly what will be saved.', available: true, skillId: 'skill.workspace:review', destination: 'workspace', where: '/p/.mauzcode/skills/review', source: 'draft', digest: 'a'.repeat(64), files: [{ path: 'SKILL.md', bytes: 40, executable: false, adapted: false }], manifest: '# Review', changes: [], result: null, csrfToken: 'csrf' };
 }) as never);
 const { container } = render(<SecureInputHost agentId="a" />);
 const card = await screen.findByRole('region', { name: 'Add skill skill.workspace:review' });
 expect(card.className).toContain('question-card');
 expect(await screen.findByText('skill.workspace:review')).toBeTruthy();
 expect(container.querySelectorAll('iframe')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button', { name: 'Добавить скилл' }));
 await vi.waitFor(() => expect(vi.mocked(requestJson)).toHaveBeenCalledWith('/skills/review/k', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }), body: JSON.stringify({ decision: 'approve', digest: 'a'.repeat(64) }) })));
});
