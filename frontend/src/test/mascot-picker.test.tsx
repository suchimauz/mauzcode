import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MascotPicker } from '../components/mauzcode/MascotPicker';
import { readNewSessionDraft, persistNewSessionDraft, submitNewSession } from '../lib/newSession';
import { normalizeMascotChoice } from '../lib/mascots';
beforeEach(() => { Element.prototype.animate = vi.fn(() => ({ cancel: vi.fn() })) as unknown as typeof Element.prototype.animate; });
afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });
it('defaults to random, offers thirteen named pets and reports selection', async () => {
  const change = vi.fn(); render(<MascotPicker disabled={false} onChange={change} />);
  const trigger = screen.getByRole('button', { name: 'Выбрать питомца: Случайный' });
  expect(screen.queryByRole('button', { name: /Поиграть/ })).toBeNull();
  fireEvent.click(trigger);
  const options = await screen.findAllByRole('menuitemradio'); expect(options).toHaveLength(14);
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Calico' }));
  expect(change).toHaveBeenCalledWith('calico');
});
it('the mascot of the chosen pet is the trigger', () => { const { container } = render(<MascotPicker disabled={false} value="shiba" onChange={vi.fn()} />); expect(screen.getByRole('button', { name: 'Выбрать питомца: Shiba' })).toHaveClass('tokibean-hit'); expect(container.querySelector('[data-pet="shiba"]')).not.toBeNull(); });
it('keeps pending requests locked', () => { render(<MascotPicker disabled value="shiba" onChange={vi.fn()} />); expect(screen.getByRole('button', { name: 'Выбрать питомца: Shiba' })).toBeDisabled(); });
it('persists only the current draft choice, new drafts default to random', () => {
  expect(readNewSessionDraft().mascot).toBe('random');
  persistNewSessionDraft({ ...readNewSessionDraft(), mascot: 'tabby' });
  expect(readNewSessionDraft().mascot).toBe('tabby'); sessionStorage.clear();
  expect(readNewSessionDraft().mascot).toBe('random'); expect(normalizeMascotChoice('bogus')).toBe('random');
});
it('sends explicit choice in JSON and multipart, defaulting missing choice to random', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ agentId: 'new', status: 'sent' }) }); vi.stubGlobal('fetch', fetcher);
  const draft = { ...readNewSessionDraft(), mascot: 'calico' as const, text: 'hello' };
  await submitNewSession(draft, 'csrf');
  expect(JSON.parse(fetcher.mock.calls[0][1].body).mascot).toBe('calico');
  await submitNewSession(draft, 'csrf', [new File(['a'], 'a.txt')]);
  expect(fetcher.mock.calls[1][1].body.get('mascot')).toBe('calico');
  await submitNewSession({ ...draft, mascot: undefined }, 'csrf');
  expect(JSON.parse(fetcher.mock.calls[2][1].body).mascot).toBe('random');
});
it('Keyboard flow: Enter opens the menu from the mascot, arrows pick a pet and focus returns to the mascot', async () => {
  const userEvent = (await import('@testing-library/user-event')).default;
  if (!('PointerEvent' in window)) vi.stubGlobal('PointerEvent', class extends MouseEvent { constructor(type: string, init?: PointerEventInit) { super(type, init); } });
  const change = vi.fn(); render(<MascotPicker disabled={false} onChange={change} />);
  const trigger = screen.getByRole('button', { name: 'Выбрать питомца: Случайный' });
  trigger.focus(); await userEvent.keyboard('{Enter}');
  await screen.findAllByRole('menuitemradio');
  for (let i = 0; i < 3 && document.activeElement?.textContent !== 'Краб'; i++) await userEvent.keyboard('{ArrowDown}');
  expect(document.activeElement).toHaveTextContent('Краб');
  await userEvent.keyboard('{Enter}');
  expect(change).toHaveBeenCalledWith('crab');
  await waitFor(() => expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0));
  expect(trigger).toHaveFocus();
});
