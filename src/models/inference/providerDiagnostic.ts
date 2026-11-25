/**
 * Normalize selected upstream error evidence into a bounded display diagnostic.
 *
 * Use at an inference failure boundary before discarding provider evidence. Never use the result to choose retry policy.
 * @param opts.provider Resolved provider identifier.
 * @param opts.stage Failure observation point.
 * @param opts.status Observed HTTP status if available.
 * @param opts.body Parsed provider error envelope or bounded JSON response text.
 * @param opts.request Outgoing JSON body or object inspected for echoes.
 * @param opts.secrets Credential values to suppress.
 * @param opts.transportCode Observed transport error identifier.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved provider identifier. */
        provider: string;
        /** Failure observation point. */
        stage: "http" | "stream" | "transport";
        /** Observed HTTP status if available. */
        status?: number;
        /** Parsed provider error envelope or bounded JSON response text. */
        body?: unknown;
        /** Outgoing JSON body or object inspected for echoes. */
        request?: unknown;
        /** Credential values to suppress. */
        secrets?: string[];
        /** Observed transport error identifier. */
        transportCode?: string;
    },
): types.models.ProviderDiagnostic {
    const record = (x: unknown): Record<string, unknown> | undefined => x !== null && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : undefined;
    const field = (x: unknown, key: string): unknown => record(x) ? Object.getOwnPropertyDescriptor(x, key)?.value : undefined;
    // A role in a wire message is protocol metadata. The same word inside a prompt or tool result is not.
    const roles = new Set(['user', 'model', 'assistant', 'system', 'developer', 'tool', 'function']);
    const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const values = new Set<string>(), privateTokens = new Set<string>();
    const dataLines: string[] = [], instructionLines: string[] = [];
    let complete = true, visited = 0, size = 0;
    type Position = 'envelope' | 'turns' | 'turn' | 'data';
    const scan = (x: unknown, depth: number, position: Position, privateContent = false, instruction = false): void => {
        if (!complete) return;
        if (++visited > 16000 || depth > 48) { complete = false; return; }
        if (typeof x === 'string') {
            size += x.length;
            if (size > 2000000) { complete = false; return; }
            const tokens = words(x), value = tokens.join(' ');
            if (value) {
                values.add(value);
                (instruction ? instructionLines : dataLines).push(` ${value} `);
                if (privateContent) for (const token of tokens) if (token.length >= 8) privateTokens.add(token);
            }
            return;
        }
        if (!x || typeof x !== 'object') return;
        const role = position === 'turn' ? field(x, 'role') : undefined;
        for (const key in x) {
            if (!Object.hasOwn(x, key)) continue;
            const d = Object.getOwnPropertyDescriptor(x, key);
            if (!d || !('value' in d)) { complete = false; break; }
            if (position === 'turn' && key === 'role' && roles.has(d.value)) continue;
            const child: Position = position === 'envelope' && key === 'request' && depth === 0 ? 'envelope'
                : position === 'envelope' && /^(contents|messages|input)$/.test(key) && Array.isArray(d.value) ? 'turns'
                : position === 'turns' && Array.isArray(x) ? 'turn' : 'data';
            const isInstruction = instruction || (position === 'envelope' && /^(system|instructions|systemInstruction)$/.test(key))
                || (key === 'content' && (role === 'system' || role === 'developer'));
            scan(d.value, depth + 1, child, privateContent || /^(content|text|arguments|args|output|result)$/i.test(key), isInstruction);
            if (!complete) break;
        }
    };
    try {
        const req = opts.request;
        if (typeof req === 'string' && req.length > 2000000) complete = false;
        else scan(typeof req === 'string' ? JSON.parse(req) : req, 0, 'envelope');
    } catch { complete = false; }
    const data = dataLines.join('\n'), instructions = instructionLines.join('\n');
    const credentials = (opts.secrets ?? []).flatMap(v => [v, v.replace(/^\s*(?:Bearer|Basic)\s+/i, '').trim()]).filter(Boolean);
    const leaks = (s: string) => credentials.some(v => v && s.toLowerCase().includes(v.toLowerCase())) || /(?:https?:|www\.|[\w.-]+\.[a-z]{2,}\/|[\w.+-]+@[\w.-]+|authorization|bearer\s|cookie|api[-_ ]?key|access[-_ ]?token|password|secret[=:]|(?:sk|rt|ghp|xox[baprs])[-_]\w+|\b(?:ya29\.|1\/\/|4\/)[\w.-]+|\b(?:x-[a-z-]+\s*:|[a-z]+-[a-z-]+:\s|basic\s+[a-z0-9+/=]+|AIza[\w-]+|AKIA[A-Z0-9]+|eyJ[\w-]+)|[a-z0-9+/=_-]{36,}|[\x00-\x1f\x7f<>])/i.test(s);
    const echoes = (s: string, identifier = false) => {
        const tokens = words(s);
        if (!complete || values.has(tokens.join(' '))) return true;
        return tokens.some((word, i) => {
            if (values.has(word) || privateTokens.has(word)) return true;
            if (!i) return false;
            const pair = `${tokens[i - 1]} ${word}`;
            if (values.has(pair) || data.includes(` ${pair} `)) return true;
            if (!instructions.includes(` ${pair} `)) return false;
            // Two short words such as “is not” in a longer instruction do not identify a quoted excerpt.
            // Keep exact values, longer excerpts, identifiers and all user/tool data on the strict path.
            return identifier || !/^[a-z]{1,3} [a-z]{1,3}$/.test(pair)
                || (i >= 2 && instructions.includes(` ${tokens[i - 2]} ${pair} `));
        });
    };
    const id = (v: unknown): string | undefined => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v) && !leaks(v) && !echoes(v, true) ? v : undefined;
    const provider = typeof opts.provider === "string" && /^[a-z][a-z0-9_-]{0,63}$/i.test(opts.provider) && !leaks(opts.provider) ? opts.provider : "unknown";
    const stage = opts.stage === "stream" || opts.stage === "transport" ? opts.stage : "http";
    const status = Number.isInteger(opts.status) && opts.status! >= 100 && opts.status! <= 599 ? opts.status : undefined;
    let body = opts.body;
    if (typeof body === "string") { try { body = body.length <= 16384 && Buffer.byteLength(body) <= 16384 ? JSON.parse(body) : undefined; } catch { body = undefined; } }
    if (Array.isArray(body)) body = body[0];
    const mini = opts.provider === 'minimax-coding' ? field(body, 'base_resp') : undefined;
    const err = field(body,"error") ?? field(field(body,"response"),"error") ?? mini ?? body;
    const details = field(err,"details");
    const info = Array.isArray(details) ? details.slice(0,16).find(v => field(v,"@type") === "type.googleapis.com/google.rpc.ErrorInfo") : undefined;
    const n = field(err, mini && err === mini ? 'status_code' : 'code');
    const numeric = typeof n === 'number' && Number.isSafeInteger(n) && Math.abs(n) < 1000000 && !leaks(String(n)) && !echoes(String(n)) ? String(n) : undefined;
    const code = id(field(err,"status")) ?? id(field(err,"code")) ?? numeric ?? id(field(err,"type")) ?? (stage === "transport" ? id(opts.transportCode) : undefined);
    const reason = id(field(info,"reason")) ?? id(field(err,"reason"));
    const input = field(err, mini && err === mini ? 'status_msg' : 'message');
    const raw = typeof input === 'string' && input.length <= 2048 ? input.replace(/https?:\/\/[^\s<>"']+/gi, '[link removed]').replace(/[\t\r\n ]+/g,' ').trim() : undefined;
    // An opaque or suspicious string is not a diagnostic. Reject rather than partially masking a credential or truncating before inspection.
    const message = typeof raw === "string" && raw.trim() && raw.length <= 2048 && !leaks(raw) && !echoes(raw) && !/[^\p{L}\p{N} .,;:!?()'"\[\]_-]|(?:^|\s)[\w-]+:\s*\S+\s*(?:=|;)|\b(?:[a-z\d-]+\.)+(?:com|net|org|io|test)\b|\d{7,}|[A-Za-z0-9_-]{24,}/iu.test(raw.replaceAll('[link removed]', '')) ? raw.trim().slice(0,300) : undefined;
    const summary = [provider, stage === "http" ? `HTTP${status ? ` ${status}` : ""}` : stage === "transport" ? "transport (no response)" : stage, stage !== "http" && status ? `HTTP ${status}` : undefined, code, reason !== code ? reason : undefined, message || "No safe provider explanation available"].filter(v => v !== undefined).join(" · ");
    return {provider,stage,...(status && {status}),...(code && {code}),...(reason && {reason}),...(message && {message}),summary};
}
