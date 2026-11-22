import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { runInNewContext } from 'node:vm';

const script = await Bun.file(new URL('./client.js', import.meta.url)).text();
test('desktop retry reconnects the same page and resyncs once without submitting its draft',()=>{
 let retry!:()=>void, resyncs=0, submissions=0, support:any='unknown';
 const page=new Window({url:'https://chat.example/a/chat'});
 page.document.body.innerHTML='<form><textarea name="draft"></textarea></form><aside data-live-topic="chat"></aside>';
 const form=page.document.querySelector('form')!, draft=page.document.querySelector('textarea')!;
 form.addEventListener('submit',e=>{e.preventDefault();submissions++}); draft.value='unsent draft';
 const b=browser('http/1.1','visible',{onRetry:(fn:()=>void)=>retry=fn,status:()=>{},capability:(s:any)=>support=s},page.document);
 b.live.subscribe({onEvent:()=>{},resync:()=>resyncs++});
 const hello={data:JSON.stringify({type:'hello',serverStart:1})};b.sources[0].onmessage(hello);expect(support).toBeNull();
 b.sources[0].onerror();retry();b.retry();expect(b.sources).toHaveLength(2);b.sources[1].onmessage(hello);
 expect(resyncs).toBe(1);expect(page.document.querySelector('textarea')).toBe(draft);expect(draft.value).toBe('unsent draft');expect(submissions).toBe(0);
 b.document.visibilityState='hidden';b.handlers.visibilitychange!();expect(b.sources[1].closed).toBe(false);
});
function browser(protocol = 'http/1.1', visibility = 'visible', desktop?:any, page?:Window['document']) {
    const handlers: Record<string, Function> = {};
    const timers = new Map<number, Function>();
    let timer = 0;
    const sources: any[] = [];
    class Source {
        onopen?: Function; onmessage?: Function; onerror?: Function; closed = false;
        constructor(public url: string) { sources.push(this); }
        close() { this.closed = true; }
    }
    const regions: any[] = [];
    const document = {
        visibilityState: visibility,
        querySelectorAll: (selector:string) => page ? page.querySelectorAll(selector) : regions,
        addEventListener: (name: string, fn: Function) => { handlers[name] = fn; },
        dispatchEvent: () => {},
    };
    const window: any = { mauzcodeDesktopLive:desktop, addEventListener: (name: string, fn: Function) => { handlers[name] = fn; } };
    runInNewContext(script, { window, document, EventSource: Source, performance: { getEntriesByType: () => [{ nextHopProtocol: protocol }] },
        console: { error: () => {} }, location: { reload: () => {throw Error('unexpected reload')} }, CustomEvent: class {},
        setTimeout: (fn: Function) => { timers.set(++timer, fn); return timer; }, clearTimeout: (id: number) => timers.delete(id) });
    return { regions, live: window.mauzcodeLive, document, handlers, sources, retry: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); } };
}

test('transport status observes open/hello, loss, retry, hidden close; unsubscribe and stale callbacks are safe', () => {
    const b = browser();
    const states: string[] = [];
    expect(b.live.getStatus()).toBe('connecting');
    const off = b.live.onStatus((s: string) => states.push(s));
    b.live.onStatus(() => { throw new Error('isolated'); });
    expect(() => b.live.onStatus(null)).toThrow();
    let events = 0, resyncs = 0;
    b.live.subscribe({ onEvent: () => events++, resync: () => resyncs++ });
    b.sources[0].onopen();
    b.sources[0].onmessage({ data: JSON.stringify({ type: 'hello', serverStart: 1 }) });
    expect(states).toEqual(['connected']);
    expect(events).toBe(1); expect(resyncs).toBe(0);
    b.sources[0].onerror();
    expect(b.live.getStatus()).toBe('disconnected');
    b.retry();
    expect(b.live.getStatus()).toBe('connecting');
    b.sources[0].onopen();
    expect(b.live.getStatus()).toBe('connecting');
    b.sources[1].onmessage({ data: JSON.stringify({ type: 'hello', serverStart: 1 }) });
    expect(resyncs).toBe(1);
    b.document.visibilityState = 'hidden'; b.handlers.visibilitychange!();
    expect(b.live.getStatus()).toBe('disconnected');
    expect(b.sources[1].closed).toBe(true);
    expect(states).toEqual(['connected', 'disconnected', 'connecting', 'connected', 'disconnected']);
    off(); b.document.visibilityState = 'visible'; b.handlers.visibilitychange!();
    expect(states.length).toBe(5);
    b.handlers.pagehide!(); expect(b.live.getStatus()).toBe('disconnected');
});

test('refreshTopics reconnects only changed subscriptions and resyncs on hello', () => {
    const b = browser();
    let resyncs = 0;
    b.live.subscribe({ onEvent: () => {}, resync: () => resyncs++ });
    b.sources[0].onmessage({ data: JSON.stringify({ type: 'hello', serverStart: 1 }) });
    b.live.refreshTopics(); expect(b.sources.length).toBe(1);
    b.regions.push({ getAttribute: () => 'stream:new', dataset: { liveTopic: 'stream:new' } });
    b.live.refreshTopics(); expect(b.sources.length).toBe(2);
    expect(b.sources[1].url).toContain('stream%3Anew');
    b.sources[1].onmessage({ data: JSON.stringify({ type: 'hello', serverStart: 1 }) });
    expect(resyncs).toBe(1);
    b.live.refreshTopics(); expect(b.sources.length).toBe(2);
});

test('a planned topic change reconnects without announcing a lost connection', () => {
    const b = browser();
    const states: string[] = [];
    b.live.onStatus((s: string) => states.push(s));
    b.sources[0].onopen();
    b.regions.push({ getAttribute: () => 'stream:next', dataset: { liveTopic: 'stream:next' } });
    b.live.refreshTopics();
    expect(b.sources[0].closed).toBe(true);
    expect(b.live.getStatus()).toBe('connecting');
    b.sources[1].onopen();
    expect(states).toEqual(['connected', 'connecting', 'connected']);
});

test('HTTP/2 stays connected hidden; initially hidden HTTP/1 tab is disconnected', () => {
    const b = browser('h2'); b.sources[0].onopen();
    b.document.visibilityState = 'hidden'; b.handlers.visibilitychange!();
    expect(b.live.getStatus()).toBe('connected'); expect(b.sources[0].closed).toBe(false);
    const hidden = browser('http/1.1', 'hidden');
    expect(hidden.sources.length).toBe(0); expect(hidden.live.getStatus()).toBe('disconnected');
});
