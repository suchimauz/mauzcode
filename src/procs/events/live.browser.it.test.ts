// FUNCTIONAL tests of the live-update contract (docs/live-updates.md) in a real headless Chrome against
// the real transport (/procs/events/client.js) and the real event stream:
//   - HTTP/1.1: a hidden tab gives its stream back; on return EVERY state subscriber re-reads (resync) —
//     the canvas opens that the agent showed meanwhile, every subscriber re-reads its state route.
// The legacy SSR agent page is gone (/agent/:id redirects into the authenticated React shell), so the page is
// a minimal fixture served beside the real routes: it loads the shared transport and subscribes to the canvas
// the same way the React shell's useCanvas does (canvas.changed events, resync re-reads /canvas/:id/state).
//   - HTTP/2: a hidden tab keeps its stream, so the change arrives while it is still hidden.
//   - mauzCodeLive.subscribe refuses a state subscriber without resync.
// Hidden is emulated the way the browser signals it (visibilityState + visibilitychange); HTTP/2 is
// emulated by reporting `h2` as the page's nextHopProtocol before any script runs. Runs in the suite's
// headless Chrome (test/chrome/headless.ts, a Docker container); skipped without Docker.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkTestCtx } from "../../_testCtx.entry";
import { testChrome } from "../../../test/chrome/headless";

const CDP = (await testChrome()) ?? "";
const ctx: any = await mkTestCtx();
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
    await ctx.fns.procs.http.loadRoutes({});
    server = Bun.serve({ port: 0, hostname: "127.0.0.1", idleTimeout: 60, fetch: (req, srv) => {
        const url = new URL(req.url);
        if (req.method === "GET" && url.pathname === FIXTURE) return fixturePage(url.searchParams.get("agent") ?? "");
        return ctx.fns.procs.http.handle({ req, server: srv });
    } });
});
afterAll(() => server?.stop(true));

const FIXTURE = "/__live-fixture";
/** The shared transport plus one canvas state subscriber, wired like the React shell's useCanvas. */
function fixturePage(agentId: string): Response {
    const id = JSON.stringify(agentId);
    return new Response(`<!doctype html><html><head><meta charset="utf-8"><script src="/procs/events/client.js"></script></head><body>
<main data-canvas-agent=${JSON.stringify(agentId.replace(/[^a-zA-Z0-9_-]/g, ""))}></main>
<script>
(() => {
  const main = document.querySelector('main');
  const show = open => { if (open) main.setAttribute('data-canvas-open', ''); else main.removeAttribute('data-canvas-open'); };
  const read = () => fetch('/canvas/' + encodeURIComponent(${id}) + '/state').then(r => r.json()).then(state => show(state.open));
  window.mauzcodeLive.subscribe({ name: 'fixture-canvas', types: ['canvas.changed'], resync: read,
    onEvent: event => { if (event.agentId !== ${id}) return; if (typeof event.open === 'boolean') show(event.open); else read(); } });
  read().then(() => { window.__mauzcodeCanvasInstalled = true; });
})();
</script></body></html>`, { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } });
}

/** Opens a page in a new tab; `protocol` is what the page believes carried it (before any script runs). */
async function openPage(path: string, protocol?: string) {
    const tab: any = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
    let id = 0;
    const pending = new Map<number, (v: any) => void>();
    ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); pending.get(m.id)?.(m); };
    const send = (method: string, params: any = {}) => new Promise<any>((ok) => { pending.set(++id, ok); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression: string) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
    if (protocol) {
        await send("Page.enable");
        await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const real = performance.getEntriesByType.bind(performance);
            performance.getEntriesByType = type => type === 'navigation' ? real(type).map(e => new Proxy(e, { get: (t, k) => k === 'nextHopProtocol' ? ${JSON.stringify(protocol)} : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) })) : real(type); })()` });
    }
    await send("Page.navigate", { url: `http://127.0.0.1:${server.port}${path}` });
    for (let i = 0; i < 200 && !(await evaluate("!!(window.mauzcodeLive && window.__mauzcodeCanvasInstalled && document.querySelector('[data-canvas-agent]'))")); i++) await Bun.sleep(50);
    await Bun.sleep(300);   // the stream's first hello
    const close = async () => { ws.close(); await fetch(`${CDP}/json/close/${tab.id}`).catch(() => null); };
    return { evaluate, close };
}

const canvasOpen = `!!document.querySelector('[data-canvas-agent]')?.hasAttribute('data-canvas-open')`;
const setVisibility = (state: "hidden" | "visible") => `Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => '${state}' }); document.dispatchEvent(new Event('visibilitychange')); true`;
const fetched = (part: string) => `performance.getEntriesByType('resource').filter(e => e.name.includes(${JSON.stringify(part)})).length`;
const until = async (fn: () => Promise<boolean>, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await Bun.sleep(50); } return false; };

test.skipIf(!CDP)("HTTP/1.1: a hidden tab drops its stream, and on return every state subscriber resyncs", async () => {
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const page = await openPage(`${FIXTURE}?agent=${encodeURIComponent(agent.id)}`);
    try {
        expect(await page.evaluate("window.mauzcodeLive.keepsStreamWhileHidden()")).toBe(false);
        await page.evaluate(`window.__resyncs = []; window.mauzcodeLive.subscribe({ name: 'probe', types: ['probe'], onEvent() {}, resync: reason => window.__resyncs.push(reason) }); true`);
        const stateBefore = await page.evaluate(fetched("/state"));

        await page.evaluate(setVisibility("hidden"));
        await ctx.fns.canvas.show({ agentId: agent.id, kind: "html", title: "Drawing", args: { html: "<p>drawing</p>" } });
        await Bun.sleep(300);
        expect(await page.evaluate(canvasOpen)).toBe(false);          // no stream while hidden: nothing arrived

        await page.evaluate(setVisibility("visible"));
        expect(await until(async () => await page.evaluate(canvasOpen))).toBe(true);
        expect(await page.evaluate("window.__resyncs")).toEqual(["reconnect"]);
        expect(await page.evaluate(fetched("/state"))).toBeGreaterThan(stateBefore);   // the canvas re-read its state route
    } finally {
        await page.close();
    }
}, 30_000);

test.skipIf(!CDP)("HTTP/2: a hidden tab keeps its stream and receives the change while still hidden", async () => {
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const page = await openPage(`${FIXTURE}?agent=${encodeURIComponent(agent.id)}`, "h2");
    try {
        expect(await page.evaluate("window.mauzcodeLive.keepsStreamWhileHidden()")).toBe(true);
        await page.evaluate(`window.__resyncs = []; window.mauzcodeLive.subscribe({ name: 'probe', types: ['probe'], onEvent() {}, resync: reason => window.__resyncs.push(reason) }); true`);

        await page.evaluate(setVisibility("hidden"));
        await ctx.fns.canvas.show({ agentId: agent.id, kind: "html", title: "Drawing", args: { html: "<p>drawing</p>" } });
        expect(await until(async () => await page.evaluate(canvasOpen))).toBe(true);   // arrived while hidden
        expect(await page.evaluate("document.visibilityState")).toBe("hidden");

        await page.evaluate(setVisibility("visible"));
        await Bun.sleep(300);
        expect(await page.evaluate("window.__resyncs")).toEqual([]);  // no gap, nothing to catch up
    } finally {
        await page.close();
    }
}, 30_000);

test.skipIf(!CDP)("a state subscriber without resync is refused; a command needs none", async () => {
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const page = await openPage(`${FIXTURE}?agent=${encodeURIComponent(agent.id)}`);
    try {
        const refused = await page.evaluate(`(() => { try { window.mauzcodeLive.subscribe({ types: ['x'], onEvent() {} }); return 'accepted'; } catch (e) { return String(e.message); } })()`);
        expect(refused).toContain("resync() is required");
        expect(await page.evaluate(`typeof window.mauzcodeLive.command({ types: ['x'], onEvent() {} })`)).toBe("function");
    } finally {
        await page.close();
    }
}, 30_000);
