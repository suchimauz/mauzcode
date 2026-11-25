/**
 * Read a bounded JSON error envelope from a failed provider response
 *
 * Use once before diagnostic extraction and classification. Never log the response or parse a truncated prefix.
 * @param opts.response Failed provider HTTP response whose body has not yet been consumed.
 * @param opts.captureText Optional classifier-only callback for complete bounded text; never persist or display it.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Failed provider HTTP response whose body has not yet been consumed. */
        response: Response;
        /** Optional classifier-only callback for complete bounded text; never persist or display it. */
        captureText?: (text: string) => void;
    },
): Promise<unknown> {
    const stream = opts.response.body;
    if (!stream) { opts.captureText?.(""); return null; }
    if (stream.locked) return null;
    const reader = stream.getReader();
    const bytes = new Uint8Array(16384);
    let used = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value.byteLength > bytes.length - used) return null;
            bytes.set(value, used);
            used += value.byteLength;
        }
        const text = new TextDecoder().decode(bytes.subarray(0, used));
        opts.captureText?.(text);
        return JSON.parse(text);
    } catch { return null; }
    finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
