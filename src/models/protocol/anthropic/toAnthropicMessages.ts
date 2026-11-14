/**
 * Convert canonical transcripts into Anthropic messages with stable-prefix caching
 *
 * Use inside models for provider wire compatibility without the legacy runtime. Preserves existing transcript, authentication or client identity behavior.
 * @param opts.messages Conversation messages to convert.
 * @param opts.cacheableMessageCount Exclusive canonical-message boundary for a stable-prefix cache marker. Omit to disable marking. @minimum 0
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Conversation messages to convert. */
        messages: any[];
        /** Exclusive canonical-message boundary for a stable-prefix cache marker. Omit to disable marking. @minimum 0 */
        cacheableMessageCount?: number;
    },
): any[] {
    const out: { role: "user" | "assistant"; content: any[] }[] = [];
        const compactions: any[] = [];
    
        // Screenshot-heavy histories trigger Anthropic's stricter many-image
        // dimension limit. Keep the newest 20 images and summarize older images as
        // text; the durable transcript remains unchanged.
        let imagesToOmit = Math.max(0, opts.messages.reduce((count: number, message: any) => count + toParts(message?.content).filter((part: any) => part.type === "image").length, 0) - 20);
        const push = (role: "user" | "assistant", block: any) => {
            const prev = out.length > 0 ? out[out.length - 1] : undefined;
            if (prev && prev.role === role) {
                const tail = prev.content[prev.content.length - 1];
                // Two text blocks in a row are one paragraph, not two blocks.
                if (block.type === "text" && tail?.type === "text" && !tail.cache_control) { tail.text += "\n\n" + block.text; return; }
                // A tool_result always leads its message — prose from the same turn
                // follows it, never the other way round.
                if (block.type === "tool_result") {
                    const at = prev.content.findIndex((b: any) => b.type !== "tool_result");
                    if (at >= 0) { prev.content.splice(at, 0, block); return; }
                }
                prev.content.push(block);
                return;
            }
            out.push({ role, content: [block] });
        };
    
        const markBoundary = () => {
            const last = out[out.length - 1];
            const block = last?.content[last.content.length - 1];
            if (block) block.cache_control = { type: "ephemeral" };
        };
        for (const [index, m] of opts.messages.entries()) {
            if (index === opts.cacheableMessageCount) markBoundary();
            const role = m?.role;
            let parts = toParts(m?.content);
            if (imagesToOmit > 0) {
                let omitted = 0;
                parts = parts.filter((part: any) => {
                    if (part.type !== "image" || imagesToOmit <= 0) return true;
                    imagesToOmit--; omitted++; return false;
                });
                if (omitted) parts.push({ type: "text", text: `[${omitted} earlier image${omitted === 1 ? "" : "s"} omitted from the model request]` });
            }
            const text = parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n");
            const images = parts.filter((p): p is Extract<types.tools.Content, { type: "image" }> => p.type === "image");
            const documents = parts.filter((p): p is Extract<types.tools.Content, { type: "document" }> => p.type === "document");
    
            if (role === "tool") {
                push("user", {
                    type: "tool_result",
                    tool_use_id: m.tool_call_id,
                    content: text === "" ? "(image attached below)" : text,
                    ...(m.isError ? { is_error: true } : {}),
                });
                for (const image of images) push("user", { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.data } });
                for (const document of documents) push("user", { type: "document", source: { type: "base64", media_type: document.mimeType, data: document.data }, title: document.fileName });
                continue;
            }
    
            // Native Claude compaction block: Anthropic requires it FIRST in the
            // request, in place of what it summarizes — hoisted after the loop.
            if (m?.message_type === "anthropic_compaction") {
                try { const block = typeof m.content === "string" ? JSON.parse(m.content) : m.content; if (block?.type === "compaction") compactions.push(block); } catch {}
                continue;
            }
            // An opaque Codex checkpoint means nothing to Claude.
            if (m?.message_type === "codex_compaction") continue;
    
            if (role !== "user" && role !== "assistant") continue;   // system handled elsewhere
    
            if (text.trim() !== "") push(role, { type: "text", text });
            for (const image of images) push(role, { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.data } });
            for (const document of documents) push(role, { type: "document", source: { type: "base64", media_type: document.mimeType, data: document.data }, title: document.fileName });
            for (const call of m?.tool_calls ?? []) {
                push("assistant", { type: "tool_use", id: call.id, name: call.name, input: call.args ?? {} });
            }
        }
    
        if (opts.cacheableMessageCount === opts.messages.length) markBoundary();
    
        if (compactions.length) {
            const block = compactions[compactions.length - 1];
            if (out[0]?.role === "user") out[0].content.unshift(block);
            else out.unshift({ role: "user", content: [block] });
        }
    
    
        // 4. "final assistant content cannot end with trailing whitespace" — a
        //    marker text / prose row usually carries a trailing \n, and when the
        //    transcript happens to end on assistant, the whole call is rejected.
        const last = out[out.length - 1];
        const lastBlock = last?.content[last.content.length - 1];
        if (last?.role === "assistant" && lastBlock?.type === "text") lastBlock.text = lastBlock.text.replace(/\s+$/, "");
        return out;
    
    function toParts(content: any): types.tools.Content[] {
        if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
        if (!Array.isArray(content)) return content == null ? [] : [{ type: "text", text: JSON.stringify(content) }];
        return content.filter((p: any) => p?.type === "text" && typeof p.text === "string"
            || p?.type === "image" && typeof p.data === "string" && typeof p.mimeType === "string"
            || p?.type === "document" && typeof p.data === "string" && p.mimeType === "application/pdf" && typeof p.fileName === "string");
    }
}
