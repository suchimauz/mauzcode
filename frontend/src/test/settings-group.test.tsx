import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { SettingsGroup, SettingsRow, SettingsSwitch } from '../components/settings/SettingsGroup';

afterEach(cleanup);

function Expandable({ onSwitch }: { onSwitch: (checked: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(false);
  return <SettingsGroup title="Connections" footnote="Footnote text">
    <SettingsRow label="Row A" subtitle="Sub" expanded={open} onToggle={() => setOpen(v => !v)} trailing={<SettingsSwitch label="Enable A" checked={on} onChange={e => { setOn(e.target.checked); onSwitch(e.target.checked); }} />}>
      <p>Details A</p>
    </SettingsRow>
    <SettingsRow label="Row B" />
  </SettingsGroup>;
}

it('renders the group title, rows and footnote', () => {
  render(<Expandable onSwitch={() => {}} />);
  const group = screen.getByRole('region', { name: 'Connections' });
  expect(group.querySelector('.settings-group-title')).toHaveTextContent('Connections');
  expect(group.querySelectorAll('.settings-group-surface > .settings-row')).toHaveLength(2);
  expect(group.querySelector('.settings-group-footnote')).toHaveTextContent('Footnote text');
});

it('expands a row with the keyboard and reports the state', async () => {
  const user = userEvent.setup();
  render(<Expandable onSwitch={() => {}} />);
  const toggle = screen.getByRole('button', { name: /Row A/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Details A')).toBeNull();
  toggle.focus();
  await user.keyboard('{Enter}');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const details = document.getElementById(toggle.getAttribute('aria-controls')!);
  expect(details).toHaveTextContent('Details A');
  await user.keyboard(' ');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

it('a trailing switch does not toggle the row and is not inside the disclosure', () => {
  const onSwitch = vi.fn();
  render(<Expandable onSwitch={onSwitch} />);
  const toggle = screen.getByRole('button', { name: /Row A/ });
  const sw = screen.getByRole('switch', { name: 'Enable A' });
  expect(toggle.contains(sw)).toBe(false);
  fireEvent.click(sw);
  expect(onSwitch).toHaveBeenCalledWith(true);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
