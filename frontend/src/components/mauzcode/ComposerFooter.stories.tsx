import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveComposer } from './LiveComposer';
import { CrabMascot } from './CrabMascot';
import { PlanModeBadge } from './PlanModeBadge';
import { mascotNames, type Mascot } from '../../lib/mascots';
import type { EventPage } from '../../lib/mauzcode';
const meta = { title: 'MauzCode/Composer footer', component: LiveComposer, parameters: { layout: 'fullscreen' }, loaders: [() => { globalThis.fetch = mockFetch; return {}; }] } satisfies Meta<typeof LiveComposer>;
export default meta;
type Story = StoryObj<typeof meta>;
/** Story-only fixtures so the composer renders realistic figures without a signed-in server. */
const fixtures = (url: string): unknown => {
  if (url.includes('/context')) return { budget: { estimatedTokens: 84000, usedTokens: 84000, usedSource: 'provider', contextWindow: 200000 }, details: { breakdown: null, session: {}, usage: { inputTokens: 184220, outputTokens: 9412, cacheHitRatio: .87, costUsd: .31, requests: 5 } } };
  if (url.includes('/ui-lab-api/models')) return { agentId: 'storybook', model: 'anthropic:claude-opus-4-6', label: 'Claude Opus 4.6', icon: null, models: [{ value: 'anthropic:claude-opus-4-6', label: 'Claude Opus 4.6' }], effort: { requested: 'high', applied: 'high', supported: ['low', 'medium', 'high'], mode: 'effort' } };
  if (url.startsWith('/voice/api')) { const destination = { kind: 'cloud', label: 'OpenAI Realtime' }; const route = { route: 'openai-realtime/work:live', provider: 'openai-realtime', accountName: 'work', connectionId: 'c1', modelId: 'live', label: 'GPT Live Transcribe', destination }; return { providers: [], connections: [], routes: [route], defaultRoute: { route: route.route, fixed: false }, chat: { agentId: 'storybook', route: route.route, source: 'default', status: 'ready', destination, model: { id: route.modelId, label: route.label } }, csrfToken: 't' }; }
  if (url.includes('/queue')) return { items: [] };
  if (url.includes('/goal')) return { version: 1, enabled: false };
  if (url.includes('/todos')) return { todos: null };
  if (url.includes('/triggers')) return { agentId: '', counts: { at: 0, cron: 0, watch: 0 }, triggers: [] };
  return null;
};
const realFetch = globalThis.fetch;
const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : input.url;
  const body = fixtures(url);
  return body ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) : realFetch(input, init);
}) as typeof fetch;
const page = (mascot: Mascot): EventPage => ({ mascot, agentId: `storybook-${mascot}`, events: [], olderBefore: null, hasOlder: false, isRunning: false, runState: 'idle', lastError: null, partial: null });
export const Preview: Story = {
  args: { agentId: 'storybook', running: false, onAccepted: () => {}, mascot: <CrabMascot page={null} /> },
  render: args => <div style={{ padding: '160px 32px 32px', maxWidth: 800, margin: 'auto' }}><LiveComposer {...args} /></div>,
};
/** Every pet at 720, 375 and 320 px, with and without the planning badge in the status row. */
export const PetsAndWidths: Story = {
  args: { agentId: 'storybook', running: false, onAccepted: () => {} },
  render: args => <div style={{ display: 'grid', gap: 24, padding: 24 }}>{(Object.keys(mascotNames) as Mascot[]).map(pet => <section key={pet} aria-label={pet} style={{ display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
    {[720, 375, 320].map(width => <div key={width} style={{ width, paddingTop: 96 }}><LiveComposer {...args} agentId={`storybook-${pet}-${width}`} mascot={<CrabMascot page={page(pet)} />} planningBadge={width === 320 ? undefined : <PlanModeBadge disabled={false} busy={false} onExit={() => {}} />} /></div>)}
  </section>)}</div>,
};
