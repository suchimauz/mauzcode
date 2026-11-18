import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToolRow } from './ToolRow';
const event = { idx: 1, ts: 1, type: 'tool_call', name: 'read', text: null, preview: 'Read App.tsx', toolLabel: 'Read', toolIcon: 'file', toolCategory: 'files', toolSummary: 'src/App.tsx' };
const details = { ...event, args: '{"path":"src/App.tsx"}', argsTruncated: false, result: 'export function App() {\n  return <main>Hello</main>;\n}', resultTruncated: false, isError: false };
const meta = { title: 'MauzCode/ToolRow', component: ToolRow, args: { event, agentId: 'fixture', initialDetails: details }, decorators: [Story => <div style={{ maxWidth: 760, padding: 24 }}><Story /></div>] } satisfies Meta<typeof ToolRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Read: Story = {};
const variants: [string, string, string, string, string, Record<string, unknown>, string][] = [
  ['read', 'Read', 'file', 'files', 'src/App.tsx :1-40', { path: 'src/App.tsx', startLine: 1, endLine: 40 }, 'export default App;'],
  ['grep', 'Grep', 'search', 'search', 'scrollbar in src (*.css)', { pattern: 'scrollbar', path: 'src', glob: '*.css' }, 'src/styles/scrollbar.css:6: scrollbar-width: thin;'],
  ['edit', 'Edit', 'file-edit', 'files', 'src/styles/tokens.css · 1 edit', { path: 'src/styles/tokens.css', edits: [{ oldText: '--accent: blue;', newText: '--accent: #d97757;' }] }, 'Edited tokens.css'],
  ['bash', 'Bash', 'terminal', 'commands', 'set -euo pipefail', { command: 'set -euo pipefail\nbun install --frozen-lockfile\nbun run build && bun run test -- --reporter=verbose --coverage --run src/components/mauzcode/ToolRow.tsx', secrets: '••• (1 key)' }, 'Build complete'],
  ['respondHtml', 'Answer', 'answer', 'agent', 'Отчёт готов', { html: '<p>…</p>', text: 'Отчёт готов\nподробности' }, 'ok'],
  ['todo_update', 'Todos', 'checklist', 'agent', '3 tasks', { tasks: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }] }, '{"created":true}'],
  ['delegate_task', 'Delegate', 'delegate', 'agent', 'Inspect repository · 2 tasks', { title: 'Inspect repository', tasks: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }, '{"id":"child","status":"working"}'],
  ['gitReviewComments', 'Review comments', 'comment', 'git', 'src/a.ts · open', { path: 'src/a.ts', status: 'open' }, '[]'],
  ['plugin.custom', 'plugin.custom', 'wrench', 'tools', 'example', { query: 'example' }, '{"ok":true}'],
];
export const Variants: Story = { render: () => <>{variants.map(([name, label, icon, category, summary, args, result], idx) => <ToolRow key={idx} agentId="fixture" event={{ ...event, idx, name, toolLabel: label, toolIcon: icon, toolCategory: category, toolSummary: summary }} initialDetails={{ ...details, idx, name, args: JSON.stringify(args), result }} />)}</> };
export const Error: Story = { args: { event: { ...event, type: 'tool_result', name: 'bash', toolLabel: 'Bash', toolIcon: 'terminal', toolCategory: 'commands', toolSummary: 'bun test', isError: true, preview: 'exit 1: test failed' }, initialDetails: { ...details, type: 'tool_result', name: 'bash', isError: true, args: '{}', result: 'exit 1: test failed' } } };
