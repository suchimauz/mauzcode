import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { NewSessionComposer } from '../components/mauzcode/NewSessionComposer';
import { WorkspaceSidebar } from '../components/mauzcode/WorkspaceSidebar';
import { readNewSessionDraft, resolveNewSessionPreset, type NewSessionDraft } from '../lib/newSession';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../lib/mauzcode';
import { useMauzCode } from '../hooks/useMauzCode';
vi.mock('../components/mauzcode/ModelPicker', () => ({ ModelPicker: ({ draft, onReadyChange }: { draft: { onChange: (m:string,e:string)=>void }; onReadyChange?: (ready: boolean) => void }) => { useEffect(() => { onReadyChange?.(true); }, [onReadyChange]); return <button type="button" onClick={() => draft.onChange('test:chosen','high')}>Choose model</button>; } }));
vi.mock('../components/mauzcode/CrabMascot', () => ({ CrabMascot: ({ control }: { control?: (className: string) => unknown }) => control?.('crab-hit') ?? null }));
vi.mock('../lib/newSession', async importOriginal => ({ ...await importOriginal<typeof import('../lib/newSession')>(), getNewSessionDefaults: vi.fn(async () => ({ defaultModel:'test:default',csrfToken:'token' })), submitNewSession: vi.fn() }));
vi.mock('../lib/live', () => ({ loadLiveClient: async () => {} }));
const projects = [{id:'p1',title:'First',dir:'/first',host:null,chats:[]}];
const created = vi.fn();
const initial: NewSessionDraft = { projectId:'p1',model:'test:default',effort:'',text:'',requestKey:'initial' };
function Draft() { const [draft,setDraft] = useState(initial); return <NewSessionComposer draft={draft} onChange={setDraft} projects={projects} onCreated={created} onPending={() => {}} />; }
afterEach(async () => { const { getNewSessionDefaults } = await import('../lib/newSession'); vi.mocked(getNewSessionDefaults).mockImplementation(async () => ({ version:1, defaultModel:'test:default', csrfToken:'token' })); sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); history.replaceState(null,'','/'); });
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
const confirmedDraft = (presetId = 'standard') => ({ ...initial, presetId, presetConfirmed: true });
function DraftFrom({ start }: { start: NewSessionDraft }) { const [draft,setDraft] = useState(start); return <NewSessionComposer draft={draft} onChange={setDraft} projects={projects} onCreated={created} onPending={() => {}} />; }
const optionNames = () => screen.getAllByRole('option').map(option => option.querySelector('.preset-row-name > span')?.textContent);
it('presetConfirmed survives persist/restore and is never submitted', async () => {
  const { persistNewSessionDraft, submitNewSession: realSubmit } = await vi.importActual<typeof import('../lib/newSession')>('../lib/newSession');
  persistNewSessionDraft({ ...initial, presetId:'creator', presetConfirmed:true });
  expect(readNewSessionDraft()).toMatchObject({ presetId:'creator', presetConfirmed:true });
  sessionStorage.setItem('mauzcode-ui-new-session', JSON.stringify({ ...initial, presetConfirmed:'yes' }));
  expect(readNewSessionDraft()).not.toHaveProperty('presetConfirmed');
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ agentId:'a', projectId:'p1', status:'sent' }), { headers:{ 'content-type':'application/json' } })); vi.stubGlobal('fetch', fetcher);
  await realSubmit({ ...initial, presetId:'creator', presetConfirmed:true, text:'Hi' }, 'token');
  await realSubmit({ ...initial, presetId:'creator', presetConfirmed:true, text:'Hi' }, 'token', [new File(['x'], 'a.txt')]);
  const json = JSON.parse(String((fetcher.mock.calls[0] as unknown[])[1] && ((fetcher.mock.calls[0] as unknown[])[1] as RequestInit).body));
  expect(json).toMatchObject({ presetId:'creator' }); expect(json).not.toHaveProperty('presetConfirmed');
  const form = ((fetcher.mock.calls[1] as unknown[])[1] as RequestInit).body as FormData;
  expect(form.get('presetId')).toBe('creator'); expect(form.has('presetConfirmed')).toBe(false);
});
it('Fresh session: the preset dialog opens with the default selected and marked; rows keep sort order', async () => {
  await withPresets(); render(<Draft />);
  const dialog = await screen.findByRole('dialog', { name: 'Режим агента' });
  expect(optionNames()).toEqual(['Standard','Creator','Minimal']);
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Standard');
  expect(screen.getByRole('option', { name: /Standard/ })).toHaveTextContent('по умолчанию');
  expect(screen.getAllByText('по умолчанию')).toHaveLength(1);
  expect(screen.getByRole('option', { name: /Creator/ })).toHaveAccessibleDescription('All runtime functions.');
  expect(screen.getByRole('combobox', { name: 'Поиск режима' })).toHaveFocus();
  expect(dialog).toContainElement(screen.getByRole('button', { name: 'Продолжить' }));
});
it('Keep the default with Enter: the chip shows Standard and focus moves to the message input', async () => {
  await withPresets(); render(<Draft />);
  await screen.findByRole('dialog');
  await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button', { name: 'Режим агента: Standard' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
});
it('Restored draft with a confirmed preset: no dialog and the chip shows Creator', async () => {
  await withPresets(); render(<DraftFrom start={confirmedDraft('creator')} />);
  expect(await screen.findByRole('button', { name: 'Режим агента: Creator' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('Catalogue unavailable or a single preset: no dialog opens', async () => {
  const { getNewSessionDefaults } = await import('../lib/newSession');
  vi.mocked(getNewSessionDefaults).mockRejectedValue(new Error('down'));
  const first = render(<Draft />);
  await waitFor(() => expect(getNewSessionDefaults).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'Режим агента: Режим' })).toBeDisabled();
  first.unmount();
  vi.mocked(getNewSessionDefaults).mockResolvedValue({ version:1, defaultModel:'test:default', csrfToken:'token', presets:[presetList[0]], defaultPresetId:'standard' });
  render(<Draft />);
  expect(await screen.findByRole('button', { name: 'Режим агента: Standard' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('Pending first message: the dialog does not open automatically', async () => {
  await withPresets();
  sessionStorage.setItem('mauzcode-ui-new-session-pending', JSON.stringify({ ...initial, presetId:'minimal', text:'Hi' }));
  render(<Draft />);
  expect(await screen.findByRole('button', { name: 'Режим агента: Minimal' })).toBeDisabled();
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('Esc after an auto-open keeps the default and does not reopen within the mount', async () => {
  await withPresets(); render(<Draft />);
  await screen.findByRole('dialog');
  await userEvent.keyboard('{ArrowDown}{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button', { name: 'Режим агента: Standard' })).toBeInTheDocument();
  fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hello'}});
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('Pick a preset: the chip shows Creator and the first submit carries it', async () => {
  await withPresets();
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockResolvedValue({agentId:'zz',projectId:'p1',status:'sent'});
  render(<DraftFrom start={confirmedDraft()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Режим агента: Standard' }));
  await screen.findByRole('dialog', { name: 'Режим агента' });
  await userEvent.click(screen.getByRole('option', { name: /Creator/ }));
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Creator');
  await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  expect(await screen.findByRole('button', { name: 'Режим агента: Creator' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hello'}});
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await waitFor(() => expect(created).toHaveBeenCalledWith('zz'));
  expect(vi.mocked(submitNewSession).mock.calls[0][0]).toMatchObject({ presetId:'creator', text:'Hello' });
});
it('Busy composer: the preset chip is disabled while the first submit is pending', async () => {
  await withPresets();
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockRejectedValue(new Error('Network'));
  render(<DraftFrom start={confirmedDraft()} />);
  const chip = await screen.findByRole('button', { name: 'Режим агента: Standard' });
  expect(chip).toBeEnabled();
  fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hello'}});
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await screen.findByText('Повторить отправку');
  expect(screen.getByRole('button', { name: 'Режим агента: Standard' })).toBeDisabled();
  expect(vi.mocked(submitNewSession).mock.calls[0][0]).toMatchObject({ presetId:'standard' });
});
it('Keyboard flow: Enter opens, arrows move, Enter picks Minimal and focus returns to the chip', async () => {
  await withPresets(); render(<DraftFrom start={confirmedDraft()} />);
  const chip = await screen.findByRole('button', { name: 'Режим агента: Standard' });
  chip.focus(); expect(chip).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  await screen.findByRole('dialog', { name: 'Режим агента' });
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
  await userEvent.keyboard('{ArrowDown}{ArrowDown}');
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Minimal');
  expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { selected: true }).id);
  await userEvent.keyboard('{ArrowDown}');
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Standard');
  await userEvent.keyboard('{ArrowUp}{Enter}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const updated = screen.getByRole('button', { name: 'Режим агента: Minimal' });
  await waitFor(() => expect(updated).toHaveFocus());
});
it('Cancel keeps the previous choice: Esc restores Creator', async () => {
  await withPresets(); render(<DraftFrom start={confirmedDraft('creator')} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Режим агента: Creator' }));
  await screen.findByRole('dialog');
  await userEvent.keyboard('{ArrowDown}');
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Minimal');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button', { name: 'Режим агента: Creator' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Режим агента: Creator' }));
  await screen.findByRole('dialog');
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Creator');
});
it('Search filters by name and description, keeps the selection and shows Ничего не найдено', async () => {
  await withPresets(); render(<Draft />);
  await screen.findByRole('dialog');
  const search = screen.getByRole('combobox');
  await userEvent.type(search, 'runtime');
  expect(optionNames()).toEqual(['Creator']);
  expect(screen.queryByRole('option', { selected: true })).toBeNull();
  expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await userEvent.clear(search);
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Standard');
  await userEvent.type(search, 'zzz');
  expect(screen.queryAllByRole('option')).toHaveLength(0);
  expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
  await userEvent.clear(search); await userEvent.type(search, 'MIN');
  await userEvent.keyboard('{ArrowDown}');
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Minimal');
  await userEvent.keyboard('{Enter}');
  expect(await screen.findByRole('button', { name: 'Режим агента: Minimal' })).toBeInTheDocument();
});
it('Phone bottom sheet: the search field is not focused automatically', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 560px'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  await withPresets(); render(<Draft />);
  const dialog = await screen.findByRole('dialog', { name: 'Режим агента' });
  await waitFor(() => expect(dialog).toHaveFocus());
  expect(screen.getByRole('combobox')).not.toHaveFocus();
  await userEvent.click(screen.getByRole('option', { name: /Creator/ }));
  expect(screen.getByRole('combobox')).not.toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  expect(await screen.findByRole('button', { name: 'Режим агента: Creator' })).toBeInTheDocument();
});
it('Many presets: all ten are listed in the scrollable list', async () => {
  const { getNewSessionDefaults } = await import('../lib/newSession');
  const many = Array.from({ length: 10 }, (_, i) => ({ id:`p${i}`, name:`Preset ${i}`, description:`Mode ${i}`, sortOrder:i }));
  vi.mocked(getNewSessionDefaults).mockResolvedValue({ version:1, defaultModel:'test:default', csrfToken:'token', presets:[...many].reverse(), defaultPresetId:'p3' });
  render(<Draft />);
  await screen.findByRole('dialog');
  expect(optionNames()).toEqual(many.map(preset => preset.name));
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Preset 3');
});
it('puts the add button first inside the input; it opens the add menu and keeps the draft', async () => {
  render(<Draft />);
  const draft = screen.getByRole('textbox');
  fireEvent.input(draft,{target:{textContent:'Keep me'}});
  const plus = screen.getByRole('button', { name: 'Добавить' });
  expect(screen.getByRole('form',{name:'Ввод сообщения'})).toContainElement(plus);
  expect(plus.compareDocumentPosition(draft) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(document.querySelector('.new-session-footer')).not.toContainElement(plus);
  // Same frame as a chat: the model picker sits in the input bar, the draft title and empty context meter below.
  const bar = document.querySelector('.composer-inbar')!;
  expect(screen.getByRole('form',{name:'Ввод сообщения'})).toContainElement(bar as HTMLElement);
  expect(bar).toContainElement(screen.getByRole('button', { name: 'Choose model' }));
  expect(bar.lastElementChild).toBe(screen.getByRole('button', { name: 'Отправить сообщение' }));
  expect(document.querySelector('.new-session-footer .composer-metrics-row')).toHaveTextContent('New Session');
  expect(document.querySelector('.new-session-footer .new-session-context')).not.toBeNull();
  expect(document.querySelector('.new-session-chips')!.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await userEvent.click(plus);
  expect(plus).toHaveAttribute('aria-expanded', 'true');
  expect(await screen.findByRole('listbox')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveTextContent('Keep me');
});
it('Pet picker on the mascot: no pet chip; picking from the mascot is submitted and locked while sending', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockRejectedValue(new Error('Network'));
  render(<Draft />);
  expect(document.querySelector('.new-session-chips')?.textContent).not.toMatch(/питом/i);
  const pet = screen.getByRole('button', { name: 'Выбрать питомца: Случайный' });
  expect(pet.closest('.new-session-chips')).toBeNull();
  await userEvent.click(pet);
  await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Calico' }));
  const chosen = await screen.findByRole('button', { name: 'Выбрать питомца: Calico' });
  expect(chosen).toBeEnabled();
  fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hello'}});
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await screen.findByText('Повторить отправку');
  expect(vi.mocked(submitNewSession).mock.calls[0][0]).toMatchObject({ mascot:'calico' });
  expect(screen.getByRole('button', { name: 'Выбрать питомца: Calico' })).toBeDisabled();
});
it('Enter on an empty draft creates a session without a message', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockResolvedValue({agentId:'empty',projectId:'p1',status:'created'});
  render(<Draft />);
  const send = await screen.findByRole('button',{name:'Создать сессию'});
  await waitFor(() => expect(send).toBeEnabled());
  fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});
  await waitFor(() => expect(created).toHaveBeenCalledWith('empty'));
  expect(submitNewSession).toHaveBeenCalledTimes(1);
  expect(submitNewSession).toHaveBeenCalledWith(expect.objectContaining({text:'',projectId:'p1'}),'token');
});
it('send button on a whitespace draft creates a session; label follows the text', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockResolvedValue({agentId:'empty',projectId:'p1',status:'created'});
  render(<Draft />);
  fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Hi'}});
  expect(await screen.findByRole('button',{name:'Отправить сообщение'})).toBeInTheDocument();
  fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'  '}});
  const send = await screen.findByRole('button',{name:'Создать сессию'});
  await waitFor(() => expect(send).toBeEnabled());
  fireEvent.click(send);
  await waitFor(() => expect(created).toHaveBeenCalledWith('empty'));
  expect(submitNewSession).toHaveBeenCalledWith(expect.objectContaining({text:''}),'token');
});
it('without a Workspace an empty draft cannot be created', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  render(<NewSessionComposer draft={{...initial,projectId:''}} onChange={() => {}} projects={projects} onCreated={created} onPending={() => {}} />);
  expect(await screen.findByRole('button',{name:'Создать сессию'})).toBeDisabled();
  fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(submitNewSession).not.toHaveBeenCalled();
});
it('an existing chat input still ignores empty Enter', async () => {
  const { MessageInput } = await import('../components/mauzcode/MessageInput');
  const onSend = vi.fn();
  render(<MessageInput value="  " onChange={() => {}} onSend={onSend} />);
  expect(screen.getByRole('button',{name:'Отправить сообщение'})).toBeDisabled();
  fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});
  fireEvent.submit(screen.getByRole('form',{name:'Ввод сообщения'}));
  expect(onSend).not.toHaveBeenCalled();
});
