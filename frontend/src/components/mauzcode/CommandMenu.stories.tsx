import type { Meta, StoryObj } from '@storybook/react-vite';
import { CommandMenu } from './CommandMenu';

const meta = { title: 'MauzCode/Command menu', component: CommandMenu, decorators: [Story => <div style={{ position: 'relative', width: 440, marginTop: 180 }}><Story /></div>] } satisfies Meta<typeof CommandMenu>;
export default meta;
const base = { kind: 'action', enabled: true, usage: [], order: 0 };
export const PluginSection: StoryObj<typeof meta> = { args: {
  id: 'command-preview', status: 'ready', index: 0, error: '', onPick: () => {}, onHover: () => {}, onRetry: () => {},
  sections: [{ id: 'commands', label: 'Commands', order: 0 }, { id: 'git', label: 'Version control', order: 1 }],
  commands: [
    { ...base, section: 'commands', name: 'goal', label: 'Goal', icon: 'target', description: 'Open the goal editor', kind: 'client', clientAction: 'open-goal' },
    { ...base, section: 'git', name: 'git:review', label: 'Review changes', icon: 'code', description: 'Review your working tree' },
    { ...base, section: 'git', name: 'git:summary', label: 'Summarize changes', icon: 'file', description: '', enabled: false, reason: 'No changes to summarize' },
  ],
} };
