/** Upstream Tokibean renderer contract (src/pet.js header). */
export type TokibeanState = 'idle' | 'working' | 'attention' | 'done' | 'limit';
export type TokibeanExtra = { toolNote?: string; celebrate?: number; agentCount?: number; oops?: boolean; tickle?: boolean; pat?: boolean; dragging?: boolean; textScale?: number; gazeX?: number | null; gazeY?: number | null };
export type TokibeanRenderer = { draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state: TokibeanState, warn: boolean, bubble: string | null, t: number, extra: TokibeanExtra): void };
declare global { interface Window { PetRenderer?: TokibeanRenderer; PetKit?: unknown } }
/** Read the renderer the last evaluated skin installed. Each skin module calls this right after its vendored import. */
export function captureRenderer(skin: string): TokibeanRenderer {
  const renderer = window.PetRenderer;
  if (!renderer || typeof renderer.draw !== 'function') throw new Error(`Tokibean skin ${skin} did not install a renderer`);
  return renderer;
}
