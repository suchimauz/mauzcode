import { afterEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesktopTitleBar } from '../components/mauzcode/DesktopTitleBar';
import { useTheme } from '../hooks/useTheme';
import type { DesktopWindowBridge } from '../lib/live';

const bridge = (platform: DesktopWindowBridge['platform']): DesktopWindowBridge => ({ version: 1, platform, titleBar: { height: 40, controls: platform === 'darwin' ? 'left' : 'right' }, setTheme: vi.fn(), openMenu: vi.fn() });
afterEach(() => { delete window.mauzcodeDesktopWindow; document.documentElement.classList.remove('mauzcode-desktop-frame'); });

it('browser: renders nothing and leaves the document frame alone', () => {
  const { container } = render(<DesktopTitleBar title="Chat" />);
  expect(container).toBeEmptyDOMElement();
  expect(document.documentElement).not.toHaveClass('mauzcode-desktop-frame');
});

it('Windows/Linux: draggable strip with the chat title, controls on the right and the shell menu on ⋯', async () => {
  const b = window.mauzcodeDesktopWindow = bridge('win32');
  const { unmount } = render(<DesktopTitleBar title="Release notes" />);
  const header = screen.getByRole('banner', { name: 'Заголовок окна' });
  expect(header).toHaveClass('desktop-titlebar--controls-right');
  expect(header).toHaveTextContent('Release notes');
  expect(document.documentElement).toHaveClass('mauzcode-desktop-frame');
  expect(document.title).toBe('Release notes — MauzCode');
  await userEvent.click(screen.getByRole('button', { name: 'Меню приложения' }));
  expect(b.openMenu).toHaveBeenCalledTimes(1);
  const [x, y] = vi.mocked(b.openMenu).mock.calls[0];
  expect(Number.isFinite(x) && x >= 0 && Number.isFinite(y) && y >= 0).toBe(true);
  unmount();
  expect(document.documentElement).not.toHaveClass('mauzcode-desktop-frame');
});

it('macOS: leaves room for the traffic lights; an empty title falls back to the product name', () => {
  window.mauzcodeDesktopWindow = bridge('darwin');
  render(<DesktopTitleBar title="" />);
  expect(screen.getByRole('banner')).toHaveClass('desktop-titlebar--controls-left');
  expect(screen.getByRole('banner')).toHaveTextContent('MauzCode');
});

it('theme changes are reported to the desktop frame', async () => {
  const b = window.mauzcodeDesktopWindow = bridge('linux');
  let api!: ReturnType<typeof useTheme>;
  function Probe() { api = useTheme(); return null; }
  render(<Probe />);
  await vi.waitFor(() => expect(b.setTheme).toHaveBeenCalled());
  act(() => api.setTheme('dark'));
  expect(b.setTheme).toHaveBeenLastCalledWith('dark');
  act(() => api.setTheme('light'));
  expect(b.setTheme).toHaveBeenLastCalledWith('light');
});
