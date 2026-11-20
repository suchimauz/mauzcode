import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { NewSessionComposer } from '../components/mauzcode/NewSessionComposer';
import { WorkspaceSidebar } from '../components/mauzcode/WorkspaceSidebar';
import { readNewSessionDraft, resolveNewSessionPreset, type NewSessionDraft } from '../lib/newSession';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../lib/mauzcode';
import { useMauzCode } from '../hooks/useMauzCode';
vi.mock('../components/mauzcode/ModelPicker', () => ({ ModelPicker: ({ draft, onReadyChange }: { draft: { onChange: (m:string,e:string)=>void }; onReadyChange?: (ready: boolean) => void }) => { useEffect(() => { onReadyChange?.(true); }, [onReadyChange]); return <button onClick={() => draft.onChange('test:chosen','high')}>Choose model</button>; } }));
vi.mock('../components/mauzcode/CrabMascot', () => ({ CrabMascot: () => null }));
vi.mock('../lib/newSession', async importOriginal => ({ ...await importOriginal<typeof import('../lib/newSession')>(), getNewSessionDefaults: vi.fn(async () => ({ defaultModel:'test:default',csrfToken:'token' })), submitNewSession: vi.fn() }));
vi.mock('../lib/live', () => ({ loadLiveClient: async () => {} }));
const projects = [{id:'p1',title:'First',dir:'/first',host:null,chats:[]}];
const created = vi.fn();
const initial: NewSessionDraft = { projectId:'p1',model:'test:default',effort:'',text:'',requestKey:'initial' };
function Draft() { const [draft,setDraft] = useState(initial); return <NewSessionComposer draft={draft} onChange={setDraft} projects={projects} onCreated={created} onPending={() => {}} />; }
afterEach(() => { sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); history.replaceState(null,'','/'); });
it('typing and model selection stay local; first send creates once with the selected settings', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockResolvedValue({agentId:'zz',projectId:'p1',status:'sent'});
  render(<Draft />);
  fireEvent.click(screen.getByText('Choose model'));
  fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hello'}});
  expect(submitNewSession).not.toHaveBeenCalled();
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await waitFor(() => expect(created).toHaveBeenCalledWith('zz'));
  expect(submitNewSession).toHaveBeenCalledTimes(1);
  expect(submitNewSession).toHaveBeenCalledWith(expect.objectContaining({text:'Hello',projectId:'p1',model:'test:chosen',effort:'high'}),'token');
});
it('uncertain retry reuses the exact immutable payload and request key', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockRejectedValueOnce(new Error('Network')).mockResolvedValueOnce({agentId:'zz',projectId:'p1',status:'sent'});
  render(<Draft />); fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hello'}}); fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await screen.findByRole('alert'); expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'false');
  fireEvent.click(screen.getByText('Повторить отправку'));
  await waitFor(() => expect(created).toHaveBeenCalledWith('zz'));
  expect(vi.mocked(submitNewSession).mock.calls[0][0]).toEqual(vi.mocked(submitNewSession).mock.calls[1][0]);
});
it('validation failure keeps text editable without creating a replacement agent', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockRejectedValue(new ApiError('Invalid workspace',400));
  render(<Draft />); fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Keep me'}}); fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await screen.findByRole('alert'); expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'true'); expect(screen.getByRole('textbox')).toHaveTextContent('Keep me'); expect(created).not.toHaveBeenCalled();
});
it('a draft has a request key but no agent id', () => { expect(readNewSessionDraft()).not.toHaveProperty('agentId'); expect(readNewSessionDraft().requestKey).toBeTruthy(); });
it('New Session action shows a local row without an agent id in its workspace', () => {
  const onNewSession=vi.fn();
  render(<WorkspaceSidebar projects={projects} selected="" draftProjectId="p1" onNewSession={onNewSession} user={null} theme="light" onTheme={()=>{}} onToggle={()=>{}} onSelect={()=>{}} onRetry={()=>{}} />);
  expect(screen.getByRole('button',{name:'First'})).toHaveAttribute('aria-expanded','true');
  const buttons=screen.getAllByRole('button',{name:'New Session'}); expect(buttons).toHaveLength(2); fireEvent.click(buttons[0]); expect(onNewSession).toHaveBeenCalledOnce();
});
it('an empty selection never fetches agent events or auto-selects a pre-existing agent', async () => {
  const fetcher=vi.fn(async () => new Response(JSON.stringify({agents:[{id:'existing'}]}),{headers:{'content-type':'application/json'}})); vi.stubGlobal('fetch',fetcher);
  function State(){ const mauzcode=useMauzCode(); return <span data-testid="selected">{mauzcode.selected || 'draft'}</span>; }
  render(<State/>); await waitFor(()=>expect(fetcher).toHaveBeenCalled());
  expect(screen.getByTestId('selected')).toHaveTextContent('draft');
  expect(fetcher.mock.calls.every(args=> !String((args as unknown[])[0]).includes('/events'))).toBe(true);
});
it('catalog failure keeps a slash draft editable and never creates a session', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'catalog offline' }), { status: 503, headers: { 'content-type': 'application/json' } })));
  render(<Draft />); fireEvent.input(screen.getByRole('textbox'), { target: { textContent: '/plan task' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Ввод сообщения' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('catalog offline');
  expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'true'); expect(screen.getByRole('textbox')).toHaveTextContent('/plan task');
  expect(submitNewSession).not.toHaveBeenCalled(); expect(created).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('mauzcode-ui-new-session-pending')).toBeNull();
});

it('has no options chip; the footer label shows the draft title or New Session', () => {
  function Titled({ title }: { title?: string }) { const [draft,setDraft] = useState<NewSessionDraft>({ ...initial, title }); return <NewSessionComposer draft={draft} onChange={setDraft} projects={projects} onCreated={created} onPending={() => {}} />; }
  const view = render(<Titled title="  Ревью API " />);
  expect(screen.queryByRole('button', { name: 'Параметры сессии' })).toBeNull();
  expect(screen.queryByText('Параметры')).toBeNull();
  expect(document.querySelector('.new-session-draft-label')).toHaveTextContent(/^Ревью API$/);
  view.unmount(); render(<Titled title="   " />);
  expect(document.querySelector('.new-session-draft-label')).toHaveTextContent(/^New Session$/);
});
it('the draft title is sent with the first message', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockResolvedValue({agentId:'zz',projectId:'p1',status:'sent'});
  function Titled() { const [draft,setDraft] = useState<NewSessionDraft>({ ...initial, title: 'Ревью API' }); return <NewSessionComposer draft={draft} onChange={setDraft} projects={projects} onCreated={created} onPending={() => {}} />; }
  render(<Titled />);
  fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hello'}});
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await waitFor(() => expect(created).toHaveBeenCalledWith('zz'));
  expect(vi.mocked(submitNewSession).mock.calls[0][0]).toMatchObject({ title: 'Ревью API', text: 'Hello' });
});
it('the sidebar draft row shows the draft title in tree and flat views', () => {
  const base = { projects, selected: '', draftProjectId: 'p1', onNewSession: vi.fn(), user: null, theme: 'light' as const, onTheme: () => {}, onToggle: () => {}, onSelect: () => {}, onRetry: () => {} };
  const view = render(<WorkspaceSidebar {...base} draftTitle="Ревью API" />);
  expect(document.querySelector('.workspace-draft-row')).toHaveTextContent('Ревью API');
  view.unmount();
  localStorage.setItem('mauzcode.workspace-view', JSON.stringify({ group: 'flat' }));
  render(<WorkspaceSidebar {...base} draftTitle=" " />);
  expect(document.querySelector('.workspace-draft-row')).toHaveTextContent('New Session');
});
it('a legacy pending submit with removed fields is not replayed; its text and title return to the draft', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  sessionStorage.setItem('mauzcode-ui-new-session-pending', JSON.stringify({ ...initial, text: 'Old text', title: 'Old title', workspaceDir: '/tmp/custom', requestKey: 'pending-key-000002' }));
  render(<Draft />);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveTextContent('Old text'));
  expect(sessionStorage.getItem('mauzcode-ui-new-session-pending')).toBeNull();
  expect(document.querySelector('.new-session-draft-label')).toHaveTextContent('Old title');
  expect(screen.queryByText('Повторить отправку')).toBeNull();
  expect(submitNewSession).not.toHaveBeenCalled();
});
it('a ?newSession=1&title= link pre-fills the draft title', () => {
  history.replaceState(null, '', '/?newSession=1&title=%D0%A0%D0%B5%D0%B2%D1%8C%D1%8E');
  expect(readNewSessionDraft().title).toBe('Ревью');
});

const presetList = [{id:'standard',name:'Standard',description:'Code and task work.',sortOrder:10},{id:'creator',name:'Creator',description:'All runtime functions.',sortOrder:20},{id:'minimal',name:'Minimal',description:'Shell and file tools.',sortOrder:30}];
async function withPresets() {
  const { getNewSessionDefaults } = await import('../lib/newSession');
  vi.mocked(getNewSessionDefaults).mockResolvedValue({ version:1, defaultModel:'test:default', csrfToken:'token', presets:[presetList[2],presetList[0],presetList[1]], defaultPresetId:'standard' });
}
it('Draft with a deleted preset falls back to the default preset', () => {
  sessionStorage.setItem('mauzcode-ui-new-session', JSON.stringify({ projectId:'p1', model:'m', effort:'', text:'', requestKey:'k', presetId:'deleted' }));
  const draft = readNewSessionDraft();
  expect(draft.presetId).toBe('deleted');
  expect(resolveNewSessionPreset(presetList, 'standard', draft.presetId)).toBe('standard');
  expect(resolveNewSessionPreset(presetList, 'standard', 'creator')).toBe('creator');
  expect(resolveNewSessionPreset(presetList, 'gone', undefined)).toBe('standard');
  expect(resolveNewSessionPreset([], 'standard', 'creator')).toBeUndefined();
});
it('Default selection: the preset chip shows the default preset', async () => {
  await withPresets(); render(<Draft />);
  expect(await screen.findByRole('button', { name: 'Режим агента: Standard' })).toHaveTextContent('Standard');
  expect(screen.queryByText('Standard mode')).toBeNull();
});
it('Pick a preset: the chip shows Creator and the first submit carries it', async () => {
  await withPresets();
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockResolvedValue({agentId:'zz',projectId:'p1',status:'sent'});
  render(<Draft />);
  await userEvent.click(await screen.findByRole('button', { name: 'Режим агента: Standard' }));
  const items = await screen.findAllByRole('menuitemradio');
  expect(items.map(item => item.getAttribute('aria-label'))).toEqual(['Standard','Creator','Minimal']);
  expect(screen.getByRole('menuitemradio', { name: 'Creator' })).toHaveAccessibleDescription('All runtime functions.');
  await userEvent.click(screen.getByRole('menuitemradio', { name: 'Creator' }));
  expect(await screen.findByRole('button', { name: 'Режим агента: Creator' })).toBeInTheDocument();
  fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hello'}});
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await waitFor(() => expect(created).toHaveBeenCalledWith('zz'));
  expect(vi.mocked(submitNewSession).mock.calls[0][0]).toMatchObject({ presetId:'creator', text:'Hello' });
});
it('Busy composer: the preset chip is disabled while the first submit is pending', async () => {
  await withPresets();
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockRejectedValue(new Error('Network'));
  render(<Draft />);
  const chip = await screen.findByRole('button', { name: 'Режим агента: Standard' });
  expect(chip).toBeEnabled();
  fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hello'}});
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await screen.findByText('Повторить отправку');
  expect(screen.getByRole('button', { name: 'Режим агента: Standard' })).toBeDisabled();
  expect(vi.mocked(submitNewSession).mock.calls[0][0]).toMatchObject({ presetId:'standard' });
});
it('Keyboard flow: Enter opens, arrows move, Enter picks Minimal and focus returns to the chip', async () => {
  // jsdom has no PointerEvent; Base UI dispatches one when Enter activates a menu item.
  if (!('PointerEvent' in window)) vi.stubGlobal('PointerEvent', class extends MouseEvent { constructor(type: string, init?: PointerEventInit) { super(type, init); } });
  await withPresets(); render(<Draft />);
  const chip = await screen.findByRole('button', { name: 'Режим агента: Standard' });
  chip.focus(); expect(chip).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  await screen.findAllByRole('menuitemradio');
  for (let i = 0; i < 3 && document.activeElement?.getAttribute('aria-label') !== 'Minimal'; i++) await userEvent.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitemradio', { name: 'Minimal' })).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(screen.queryByRole('menuitemradio')).toBeNull());
  const updated = screen.getByRole('button', { name: 'Режим агента: Minimal' });
  await waitFor(() => expect(updated).toHaveFocus());
});
it('puts the add button first inside the input; it opens the add menu and keeps the draft', async () => {
  render(<Draft />);
  const draft = screen.getByRole('textbox');
  fireEvent.input(draft,{target:{textContent:'Keep me'}});
  const plus = screen.getByRole('button', { name: 'Добавить' });
  expect(screen.getByRole('form',{name:'Ввод сообщения'})).toContainElement(plus);
  expect(plus.compareDocumentPosition(draft) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(document.querySelector('.new-session-footer')).not.toContainElement(plus);
  await userEvent.click(plus);
  expect(plus).toHaveAttribute('aria-expanded', 'true');
  expect(await screen.findByRole('listbox')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveTextContent('Keep me');
});
