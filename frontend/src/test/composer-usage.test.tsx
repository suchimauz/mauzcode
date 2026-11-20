import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposerFooter } from '../components/mauzcode/ComposerFooter';
const props = { agentId:'fixture', busy:false, running:false, revision:0 };
const result = (input: number | null, output: number | null, ratio: number | null) => ({ budget:{estimatedTokens:8000,contextWindow:200000}, details:{breakdown:null,session:{},usage:{inputTokens:input,outputTokens:output,cacheHitRatio:ratio,cachedInputTokens:3000000,cacheWriteTokens:100000,requests:5}} });
afterEach(() => vi.unstubAllGlobals());
it('shows compact usage left and context right; each part opens the same details panel and highlights only itself', async () => {
 vi.stubGlobal('fetch', vi.fn(async()=>Response.json(result(184220,9412,.87))));
 render(<ComposerFooter {...props}/>);
 expect(await screen.findByText('184k')).toBeInTheDocument(); expect(screen.getByText('9.4k')).toBeInTheDocument(); expect(screen.getByText('↑')).toBeInTheDocument(); expect(screen.getByText('↓')).toBeInTheDocument();
 // Cache hit: a bare percentage; the accessible name and tooltip still say what it is.
 expect(screen.getByText('87%')).toBeInTheDocument(); expect(screen.queryByText(/кэш/)).toBeNull();
 expect(document.querySelector('.composer-cache-hit')).toHaveAttribute('title','Попадание в кэш 87%');
 const usage=screen.getByRole('button',{name:/Input: 184,220 tok. Output: 9,412 tok. Попадание в кэш 87%/});
 const context=screen.getByRole('button',{name:/4% of context used/});
 expect(context).toHaveTextContent('4%');
 expect(screen.getAllByRole('button')).toEqual([usage,context]);
 for (const part of [usage,context]) {
  const other=part===usage?context:usage;
  expect(part).toHaveAttribute('aria-expanded','false');
  await userEvent.click(part);
  const dialog=await screen.findByRole('dialog',{name:'Context usage'});
  expect(dialog).toHaveTextContent('Token usage'); expect(part).toHaveAttribute('aria-controls',dialog.id);
  expect(part).toHaveAttribute('aria-expanded','true'); expect(other).toHaveAttribute('aria-expanded','false');
  await userEvent.keyboard('{Escape}');
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 }
});
it('never hides the cache hit with a container query; only used/total tokens hide when narrow', () => {
 const css=readFileSync(resolve(__dirname,'../components/mauzcode/composer-footer.css'),'utf8');
 const queries=css.split('\n').filter(line=>line.startsWith('@container'));
 expect(queries.some(q=>q.includes('.composer-metrics-window { display:none; }'))).toBe(true);
 expect(queries.some(q=>/(composer-cache-hit|composer-cost|composer-token-count|composer-metrics-usage)[^}]*display:none/.test(q))).toBe(false);
});
it('keeps missing usage distinct from measured zero', async () => {
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(result(null,null,null))));
 const ui=render(<ComposerFooter {...props}/>);
 await screen.findByText('4%');
 const tokens=()=>[...document.querySelectorAll('.composer-token-count .rolling-number-sr')].map(node=>node.textContent);
 expect(tokens()).toEqual(['—','—']); expect(document.querySelector('.composer-cache-hit .rolling-number-sr')).toHaveTextContent('—');
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(result(0,0,0))));
 ui.rerender(<ComposerFooter {...props} revision={1}/>);
 await waitFor(()=>expect(tokens()).toEqual(['0','0'])); expect(document.querySelector('.composer-cache-hit .rolling-number-sr')).toHaveTextContent('0%');
});
