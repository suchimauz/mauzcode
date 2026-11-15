/**
 * Convert canonical transcripts into OpenAI chat messages with tool and image support
 *
 * Use inside models for provider wire compatibility without the legacy runtime. Preserves existing transcript, authentication or client identity behavior. With replayReasoning, an assistant tool-call message replays the non-empty reasoning its first tool call carries as reasoning_content; without it, stored reasoning is ignored. Tool results, images and PDF fallbacks are unchanged.
 * @param opts.messages Conversation messages to convert.
 * @param opts.replayReasoning Replay stored assistant reasoning on tool-call turns. @default false
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Conversation messages to convert. */
        messages: any[];
        /** Replay the first tool call's non-empty reasoning_content on the assistant wire message. @default false */
        replayReasoning?: boolean;
    },
): any[] {
    const out: any[] = [];
    
        for (const m of opts.messages) {
            if (m?.role === "tool") {
                const parts = toParts(m.content);
                const text = textParts(parts).join("\n");
                out.push({ role: "tool", tool_call_id: m.tool_call_id, content: text || "(image attached below)" });
                const images = parts.filter((p: any) => p.type === "image").map((p: any) => ({ type: "image_url", image_url: { url: `data:${p.mimeType};base64,${p.data}` } }));
                if (images.length) out.push({ role: "user", content: images });
                continue;
            }
    
            const parts = toParts(m?.content);
            const text = textParts(parts).join("\n");
            const images = parts.filter((p: any) => p.type === "image").map((p: any) => ({ type: "image_url", image_url: { url: `data:${p.mimeType};base64,${p.data}` } }));
            const calls = m?.tool_calls ?? [];
            if (!calls.length) {
                if (m?.role) out.push({ role: m.role, content: images.length ? [...(text ? [{ type: "text", text }] : []), ...images] : text });
                continue;
            }
    
            const msg: any = { role: "assistant", tool_calls: calls.map((c: any) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
            })) };
            if (text.trim() !== "") msg.content = text;
            // Opt-in replay only: reasoning saved on the first tool call of a persisted turn.
            if (opts.replayReasoning === true) {
                const reasoning = calls[0]?.reasoning_content;
                if (typeof reasoning === "string" && reasoning) msg.reasoning_content = reasoning;
            }
            out.push(msg);
        }
    
        return out;
    
    function toParts(content: any): types.tools.Content[] {
        if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
        if (!Array.isArray(content)) return content == null ? [] : [{ type: "text", text: JSON.stringify(content) }];
        return content.filter((p: any) => p?.type === "text" && typeof p.text === "string"
            || p?.type === "image" && typeof p.data === "string" && typeof p.mimeType === "string"
            || p?.type === "document" && typeof p.fileName === "string");
    }
    function textParts(parts: types.tools.Content[]): string[] {
        return parts.flatMap((p: any) => p.type === "text" ? [p.text]
            : p.type === "document" ? [`[Attached PDF: ${p.fileName}${p.path ? `\nLocal path: ${p.path}` : ""}]${p.extractedText ? `\n\n${p.extractedText}` : ""}`]
            : []);
    }
}
