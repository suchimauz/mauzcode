// GET /events — long-lived Server-Sent Events stream.
// Every page opens one; the server pushes reload / custom events down it. The
// stream doubles as presence: it begins when a tab opens and ends when it
// closes, which is a better answer to "who is here" than anything a heartbeat
// could give.
// `?topics=agent:eh,agents` narrows the stream SERVER-side: a tab watching one
// agent is not woken by every other agent's traffic. Global events (reload,
// notify) still reach everybody — see procs.events.emit.
/**
 * Handle the GET request for the events route.
 * @param opts.req The incoming HTTP request.
 */
export default async function (ctx: Context, session: Session, opts: { req: Request }) {
    const topics = (new URL(opts.req.url).searchParams.get("topics") ?? "")
        .split(",").map(t => t.trim()).filter(Boolean);
    // mauzcode: opt-in desktop adapter shares this stream, never a public topic.
    const desktop = new URL(opts.req.url).searchParams.get('desktop') === '1'
        ? await ctx.fns.events.desktopAccess({req:opts.req}).catch(() => null) : null;
    let cancelStream = () => {};
    const stream = new ReadableStream({
        start(controller) {
            const enc = new TextEncoder();
            let closed = false;
            let keepalive: ReturnType<typeof setInterval> | undefined;
            let unsub = () => {};
            let leave = () => {};
            let leaveDesktop = () => {};
            const cleanup = () => {
                if (closed) return;
                closed = true;
                if (keepalive) clearInterval(keepalive);
                leaveDesktop();
                leave();
                unsub();
                try { controller.close(); } catch { /* already closed */ }
            };
            cancelStream = cleanup;
            const send = (e: any) => {
                if (closed) return;
                try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); }
                catch { cleanup(); }
            };
            // A reconnecting tab may have missed signals while it was away, so
            // the greeting tells it to refresh what it shows — the same message
            // any change sends, which keeps recovery and normal operation on
            // one path instead of two.
            if (desktop) {
                const state = ((ctx.state as any).events ??= {});
                const listeners: Map<string,Set<(id:string)=>void>> = state.desktopListeners ??= new Map();
                const set = listeners.get(desktop.owner) ?? new Set();
                listeners.set(desktop.owner,set);
                const hint = async (id:string) => {
                    const access = await ctx.fns.events.desktopAccess({req:opts.req,id}).catch(() => null);
                    if (!closed && access?.scope === desktop.scope) {
                        const record = state.desktopOccurrences?.get(id);
                        if (!record) return;
                        record.issued.add(desktop.scope);
                        send({type:'desktop.occurrence',id,scope:desktop.scope});
                    }
                };
                set.add(hint);
                leaveDesktop = () => { set.delete(hint); if (!set.size) listeners.delete(desktop.owner); };
            }
            send({ type: "hello", serverStart: (ctx.state as any).serverStart, refresh: topics, ...(desktop && {desktop:{version:1,scope:desktop.scope}}) });
            unsub = ctx.fns.procs.events.subscribe({ handler: send, topics });
            // The stream is also the presence: it lasts exactly as long as the tab.
            leave = ctx.fns.procs.events.join({ topics });
            keepalive = setInterval(() => {
                try { controller.enqueue(enc.encode(`: ping\n\n`)); } catch { cleanup(); }
            }, 25_000);
            if (opts.req.signal.aborted) cleanup();
            else opts.req.signal.addEventListener("abort", cleanup, { once: true });
        },
        cancel() { cancelStream(); },
    });
    return new Response(stream, {
        headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache, no-transform",
            "connection": "keep-alive",
            // nginx/openresty in front buffers proxied responses by default; a buffered
            // stream never delivers `hello`, so EventSource stays in "connecting".
            "x-accel-buffering": "no",
        },
    });
}
