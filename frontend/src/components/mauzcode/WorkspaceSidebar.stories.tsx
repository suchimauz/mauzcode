import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceSidebar } from './WorkspaceSidebar';
const meta = {
  title: 'MauzCode/Workspace Sidebar', component: WorkspaceSidebar, parameters: { layout: 'fullscreen' },
  args: { projects: [{ id: 'fixture', title: 'MauzCode UI', dir: '/workspace/mauzcode-ui', host: null, chats: [{ id: 'ab', title: 'Навигация и рабочие пространства', model: 'fixture', runState: 'running', hasUnread: true, lastReplyAt: Date.now() - 180000 }, { id: 'ac', title: 'Компоненты и дизайн-система', model: 'fixture', runState: 'idle', hasUnread: false, lastReplyAt: Date.now() - 86400000 }] }], user: { name: 'Demo User', role: 'owner' }, selected: 'ab', theme: 'light', onTheme: () => {}, onToggle: () => {}, onSelect: () => {}, onRetry: () => {} },
  decorators: [(Story, context) => <div style={{ width: context.args.compact ? 56 : 280, height: '100vh', borderRight: '1px solid var(--line)' }}><Story /></div>],
} satisfies Meta<typeof WorkspaceSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Expanded: Story = {};
export const Compact: Story = { args: { compact: true } };
export const Loading: Story = { args: { projects: [], loading: true } };
export const Error: Story = { args: { projects: [], error: 'Не удалось загрузить рабочие пространства' } };
export const Member: Story = { args: { user: { name: 'Demo Member', role: 'member' } } };
const quotas = [
  { id: 'claude-code:main', provider: 'claude-code', account: 'main', label: 'claude-code · main', model: 'claude-code/main:', connection: 'local', kind: 'quota', windows: { fiveHour: { usedPercent: 24, resetsAt: Date.now() + 3600e3, tone: 'neutral' }, weekly: { usedPercent: 45, resetsAt: Date.now() + 86400e3, tone: 'warning' } }, tone: 'warning', parkedAgents: 0 },
  { id: 'codex:su@srv', provider: 'codex', account: 'example-account', label: 'codex · ssh.srv.example-account', model: 'codex/example-account:', connection: 'ssh', host: 'aeza', kind: 'quota', windows: { weekly: { usedPercent: 93, resetsAt: Date.now() + 2 * 86400e3, tone: 'error' } }, tone: 'error', planType: 'pro', parkedAgents: 1 },
  { id: 'opencode:default', provider: 'opencode', account: 'default', label: 'OpenCode Go', model: 'opencode/default:', connection: 'mauzcode', host: 'node1', kind: 'quota', windows: { fiveHour: { usedPercent: 0, resetsAt: null, tone: 'neutral' }, weekly: { usedPercent: 15, resetsAt: null, tone: 'neutral' }, monthly: { usedPercent: 65, resetsAt: null, tone: 'critical' } }, tone: 'critical', parkedAgents: 0 },
  { id: 'oneapi:default', provider: 'oneapi', account: 'default', label: 'Asoft LLM Gate', model: 'oneapi/default:', connection: 'local', kind: 'status', status: 'available', tone: 'neutral', parkedAgents: 0 },
  { id: 'claude-code:x@srv', provider: 'claude-code', account: 'brailyn', label: 'claude-code · ssh', model: 'claude-code/brailyn:', connection: 'ssh', host: 'aeza', kind: 'quota', windows: {}, quotaStatus: 'unavailable', tone: 'neutral', parkedAgents: 0 },
] satisfies import('../../lib/quotas').QuotaAccount[];
/** One Antigravity connection: a card per model family with the standard used-percent period cells. */
const familyWindow = (family: 'gemini' | 'claude', bucket: string, period: 'fiveHour' | 'weekly', usedPercent: number | null, resetsAt: number | null, tone: 'neutral' | 'warning' | 'critical' | 'error' = 'neutral', scope: 'group' | 'unknown' = 'group') =>
  ({ id: `antigravity:${bucket}`, label: bucket, scope, bucket, period, model: null, family, usedPercent, remaining: null, resetsAt, observedAt: Date.now(), tone });
const antigravity = {
  id: 'antigravity:work', provider: 'antigravity', account: 'work', label: 'Antigravity · work', model: 'antigravity/work', connection: 'mauzcode', kind: 'quota', windows: {},
  additionalWindows: [familyWindow('gemini', 'gemini-5h', 'fiveHour', 20, Date.now() + 3 * 3600e3), familyWindow('gemini', 'gemini-weekly', 'weekly', 60, Date.now() + 5 * 86400e3, 'warning'),
    familyWindow('claude', '3p-5h', 'fiveHour', 10, null), familyWindow('claude', '3p-weekly', 'weekly', 75, Date.now() + 4 * 86400e3, 'error')],
  families: [{ family: 'gemini', partial: false }, { family: 'claude', partial: false }], quotaStatus: 'fresh', quotaUpdatedAt: Date.now(), tone: 'warning', parkedAgents: 0,
} satisfies import('../../lib/quotas').QuotaAccount;
/** Gemini with an extra model-only weekly bucket, an unmeasured Claude/GPT pool and an extra bucket of no family. */
const antigravityUnknown = {
  ...antigravity, id: 'antigravity:home', account: 'home', label: 'Antigravity · home', model: 'antigravity/home', tone: 'neutral',
  additionalWindows: [familyWindow('gemini', 'gemini-5h', 'fiveHour', 100, Date.now() + 2 * 3600e3, 'error'), familyWindow('gemini', 'gemini-weekly', 'weekly', null, null),
    familyWindow('gemini', 'gemini-pro-weekly', 'weekly', 40, Date.now() + 6 * 86400e3, 'neutral', 'unknown'), familyWindow('claude', '3p-5h', 'fiveHour', null, Date.now() + 86400e3),
    { ...familyWindow('claude', 'other-daily', 'fiveHour', 30, null, 'neutral', 'unknown'), family: null, period: null }],
} satisfies import('../../lib/quotas').QuotaAccount;
export const WithQuotas: Story = { args: { quotas: [...quotas, antigravity] } };
/** Three ordinary cards leave one slot, so the first pair moves to the next row; the second account keeps its own pair. */
export const WithFamilyQuotaPairs: Story = { args: { quotas: [...quotas.slice(0, 3), antigravity, antigravityUnknown] } };
export const CompactWithQuotas: Story = { args: { quotas: [...quotas, antigravity, antigravityUnknown], compact: true } };
/** Phone layout: the collapsible Usage section (expanded by default here) with the same family cards. */
export const MobileWithQuotas: Story = { args: { quotas: [...quotas.slice(0, 3), antigravity, antigravityUnknown], mobile: true }, decorators: [Story => { try { localStorage.setItem('mauzcode.quotaMatrix.expanded', '1'); } catch { /* storage unavailable */ } return <Story />; }] };
