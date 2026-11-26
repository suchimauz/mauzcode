import { mkTestCtx } from "../../_testCtx.entry";
import antigravity from "../$modelProvider_antigravity";
// Synthetic fetchAvailableModels inventory: public or invented ids only, never an account dump.
import INVENTORY from "./antigravity-inventory.json";

export const API = "https://daily-cloudcode-pa.googleapis.com/v1internal";
export const STREAM = API + ":streamGenerateContent?alt=sse";
export const LIST = API + ":fetchAvailableModels";
export const SUMMARY = API + ":retrieveUserQuotaSummary";
export const TOKEN = "https://oauth2.googleapis.com/token";
export const ACCESS = "ya29.SECRET-access";
export const REFRESH = "1//SECRET-refresh";
export const RESET = Date.parse("2031-01-02T03:04:05Z");
export { INVENTORY };
/** Synthetic quota summary bucket; never an account observation. */
export const bucket = (bucketId: string, window: string, remainingFraction?: number, resetTime?: string, displayName?: string) =>
    ({ bucketId, window, ...(displayName ? { displayName } : {}), ...(remainingFraction !== undefined ? { remainingFraction } : {}), ...(resetTime ? { resetTime } : {}) });
/** Synthetic retrieveUserQuotaSummary response: four unequal readings with distinct resets. */
export const SUMMARY_BODY = { groups: [
    { displayName: "Gemini", buckets: [bucket("gemini-5h", "5h", 0.8, "2031-01-02T03:04:05Z", "Gemini 5h"), bucket("gemini-weekly", "weekly", 0.4, "2031-01-08T00:00:00Z", "Gemini weekly")] },
    { displayName: "Claude and GPT", buckets: [bucket("3p-5h", "5h", 0.9, "2031-01-02T05:00:00Z"), bucket("3p-weekly", "weekly", 0.25, "2031-01-09T00:00:00Z")] },
] };

export type Call = { url: string; method: string; headers: Record<string, string>; body: any };
export type Inventory = Record<string, any>;

export const sse = (events: unknown[]) => new Response(events.map(e => "data: " + JSON.stringify(e) + "\n\n").join(""), { headers: { "content-type": "text/event-stream" } });
export const wrap = (response: unknown) => ({ response, traceId: "t" });
export const text = (value: string, usage?: Record<string, number>) => sse([wrap({ candidates: [{ content: { parts: [{ text: value }] }, finishReason: "STOP" }], ...(usage ? { usageMetadata: usage } : {}) })]);
/** Deep copy of the synthetic inventory for per-test edits. */
export const inventory = (edit?: (inv: Inventory) => void): Inventory => { const inv = structuredClone(INVENTORY) as Inventory; edit?.(inv); return inv; };

/**
 * Isolated Antigravity world: real provider code over a fake transport. `inventory` answers fetchAvailableModels,
 * `summary` answers retrieveUserQuotaSummary (each an object, a Response or a promise of either) and `stream` answers
 * generations; nothing leaves the process.
 */
export async function world(opts: { inventory?: (call: Call, n: number) => unknown; summary?: (call: Call, n: number) => unknown; stream?: (call: Call, n: number) => Response | Promise<Response> } = {}) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64") } });
    ctx.state.models ??= {};
    ctx.state.models.providers = { ...(ctx.state.models.providers ?? {}), antigravity: { owner: "core", module: "models", rel: "models/$modelProvider_antigravity.ts", definition: antigravity } };
    ctx.state.models.health = {};
    const calls: Call[] = [];
    let gens = 0, lists = 0, sums = 0;
    ctx.state.registry.models.transport.validateTransport = async (_c: unknown, _s: unknown, o: { transport: types.models.TransportSpec }) => o.transport;
    ctx.state.registry.models.transport.fetch = async (_c: unknown, _s: unknown, o: { url: string; init?: RequestInit }) => {
        if (o.init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
        const raw = String(o.init?.body ?? "");
        const call: Call = { url: o.url, method: o.init?.method ?? "GET", headers: Object.fromEntries(new Headers(o.init?.headers).entries()), body: raw.startsWith("{") ? JSON.parse(raw) : raw };
        calls.push(call);
        if (call.url === TOKEN) return Response.json({ access_token: "ya29.refreshed", expires_in: 3600 });
        if (call.url === API + ":loadCodeAssist") return Response.json({ cloudaicompanionProject: { id: "proj-" + call.headers.authorization!.slice(-4) } });
        if (call.url === LIST) { const r = await (opts.inventory ? opts.inventory(call, ++lists) : INVENTORY); return r instanceof Response ? r : Response.json(r); }
        if (call.url === SUMMARY) { const r = await (opts.summary ? opts.summary(call, ++sums) : SUMMARY_BODY); return r instanceof Response ? r : Response.json(r); }
        if (call.url === STREAM && opts.stream) return opts.stream(call, ++gens);
        return new Response("unexpected", { status: 500 });
    };
    /** Create a signed-in connection; `refresh` also publishes its catalogue. */
    const connect = async (accountName: string, access = ACCESS, refresh = true) => {
        const view = await ctx.fns.models.create({ provider: "antigravity", accountName, config: {}, secrets: {}, transport: { kind: "direct" } });
        const conn = (await ctx.fns.models.connections.resolve({ id: view.id })).conn;
        await ctx.fns.models.provider.antigravity.auth({ conn, op: "store", tokens: { access_token: access, refresh_token: REFRESH, expires_in: 3600 } });
        if (refresh) await ctx.fns.models.listModels({ id: view.id, refresh: true });
        return { view, conn, id: view.id as string, route: (model: string) => `antigravity/${accountName}:${model}` };
    };
    const of = (url: string) => calls.filter(c => c.url === url);
    return { ctx, calls, connect, gens: () => of(STREAM), lists: () => of(LIST), summaries: () => of(SUMMARY) };
}
