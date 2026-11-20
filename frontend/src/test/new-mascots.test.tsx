import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrabMascot } from '../components/mauzcode/CrabMascot';
import { tokibeanFrame } from '../components/mauzcode/TokibeanMascot';
import { tokibeanRenderers } from '../lib/tokibean';
import { mascotsOfKind } from '../lib/mascots';
import type { EventPage } from '../lib/mauzcode';
const page = (mascot: EventPage['mascot'], patch: Partial<EventPage> = {}): EventPage => ({ mascot, agentId: 'pet', events: [], olderBefore: null, hasOlder: false, isRunning: false, runState: 'idle', lastError: null, partial: null, ...patch });
const tool = (name: string, args?: Record<string, unknown>) => ({ id: '1', name, startedAt: 1, state: 'running' as const, tail: '', args });
const noop = () => {};
// A canvas context that accepts every upstream drawing call.
const fakeContext = () => new Proxy({ measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }) } as Record<string, unknown>, { get: (target, key) => key in target ? target[key as string] : noop, set: () => true });
let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  frames = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext() as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.mocked(matchMedia).mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList); });

describe('Tokibean pets', () => {
  it('captures six distinct vendored renderers', () => {
    const draws = Object.values(tokibeanRenderers).map(renderer => renderer.draw);
    expect(new Set(draws).size).toBe(6);
    expect(Object.keys(tokibeanRenderers).sort()).toEqual(mascotsOfKind('tokibean').sort());
  });
  it.each(mascotsOfKind('tokibean'))('%s draws every state without throwing', pet => {
    const renderer = tokibeanRenderers[pet as keyof typeof tokibeanRenderers];
    const canvas = Object.assign(document.createElement('canvas'), { width: 288, height: 184 });
    for (const activity of ['idle', 'thinking', 'command', 'git', 'testing', 'editing', 'reading', 'searching', 'browsing', 'delegating', 'planning', 'waiting', 'compacting', 'error'] as const)
      for (let t = 0; t < 60; t++) { const { state, extra } = tokibeanFrame(activity, { reaction: null, sleeping: false, hover: false }); renderer.draw(fakeContext() as unknown as CanvasRenderingContext2D, canvas, state, false, null, t, extra); }
  });
  it('maps activity to upstream state and tool note', () => {
    const life = { reaction: null, sleeping: false, hover: false } as const;
    expect(tokibeanFrame('command', life)).toMatchObject({ state: 'working', extra: { toolNote: 'cmd' } });
    expect(tokibeanFrame('editing', life)).toMatchObject({ state: 'working', extra: { toolNote: 'coding' } });
    expect(tokibeanFrame('thinking', life).extra.toolNote).toBeUndefined();
    expect(tokibeanFrame('delegating', life)).toMatchObject({ state: 'working', extra: { agentCount: 1 } });
    expect(tokibeanFrame('waiting', life).state).toBe('attention');
    expect(tokibeanFrame('error', life)).toMatchObject({ state: 'idle', extra: { oops: true } });
    expect(tokibeanFrame('idle', { ...life, sleeping: true }).state).toBe('limit');
    expect(tokibeanFrame('idle', { ...life, reaction: 'done' })).toMatchObject({ state: 'done', extra: { celebrate: 1 } });
  });
  it('renders a running shell as the command animation, celebrates the end and disables poking while running', () => {
    const { container, rerender } = render(<CrabMascot page={page('shiba', { isRunning: true, activeTools: [tool('bash', { command: 'ls' })] })} />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute('data-pet', 'shiba');
    expect(root).toHaveAttribute('data-note', 'cmd');
    expect(screen.getByRole('button', { name: 'Поиграть с Shiba' })).toBeDisabled();
    expect(frames.length).toBeGreaterThan(0);
    rerender(<CrabMascot page={page('shiba')} />);
    expect(container.firstChild).toHaveAttribute('data-animation', 'done');
  });
  it('draws a single frame under reduced motion', () => {
    vi.mocked(matchMedia).mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    render(<CrabMascot page={page('dundun')} />);
    expect(frames).toHaveLength(0);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
  });
  it('pokes with the keyboard-reachable button', () => {
    vi.useFakeTimers();
    const { container } = render(<CrabMascot page={page('tabby')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Поиграть с Tabby' }));
    expect(container.firstChild).toHaveAttribute('data-animation', 'idle');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(container.firstChild).toHaveAttribute('data-animation', 'idle');
  });
});

describe('image pets', () => {
  it.each([
    ['calico', tool('bash', { command: 'make' }), 'building'],
    ['calico', tool('websearch_search'), 'typing'],
    ['cloudling', tool('read'), 'idle-reading'],
    ['clawd', tool('grep'), 'working-debugger'],
    ['claude', tool('bash', { command: 'git commit -m x' }), 'committing'],
  ] as const)('%s shows its art for the running tool', (pet, running, expected) => {
    const { container } = render(<CrabMascot page={page(pet, { isRunning: true, activeTools: [running] })} />);
    expect(container.firstChild).toHaveAttribute('data-animation', expected);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toContain(`/mascot/${pet}/${expected}.`);
    expect(img).toHaveAttribute('aria-hidden', 'true');
  });
  it('thinks, then reacts to success and failure, then idles', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CrabMascot page={page('claude', { isRunning: true, thinking: { startedAt: 1 } })} />);
    expect(container.firstChild).toHaveAttribute('data-animation', 'thinking');
    rerender(<CrabMascot page={page('claude')} />);
    expect(container.firstChild).toHaveAttribute('data-animation', 'done');
    act(() => { vi.advanceTimersByTime(3500); });
    expect(container.firstChild).toHaveAttribute('data-animation', 'idle');
    rerender(<CrabMascot page={page('claude', { isRunning: true })} />);
    rerender(<CrabMascot page={page('claude', { lastError: 'boom' })} />);
    expect(container.firstChild).toHaveAttribute('data-animation', 'error');
  });
  it('falls asleep after a quiet minute and wakes on a poke', () => {
    vi.useFakeTimers();
    const { container } = render(<CrabMascot page={page('calico')} />);
    act(() => { vi.advanceTimersByTime(70000); });
    expect(container.firstChild).toHaveAttribute('data-animation', 'sleeping');
    fireEvent.click(screen.getByRole('button', { name: 'Поиграть с Calico' }));
    expect(container.firstChild).toHaveAttribute('data-animation', 'poke');
  });
  it('shows a still canvas instead of the animated image under reduced motion', () => {
    vi.mocked(matchMedia).mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    const { container } = render(<CrabMascot page={page('cloudling')} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('canvas[data-still]')).not.toBeNull();
  });
});
