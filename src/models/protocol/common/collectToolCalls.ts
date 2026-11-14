/**
 * Accumulate streamed tool-call fragments into ordered tool calls
 *
 * Shared by Protocol.stream implementations: returns a small accumulator keyed by the protocol's stream slot (index or item id). start registers id and name, append adds argument JSON and reports a tool_args_delta event, finish returns calls in slot order with arguments parsed as JSON ({ __unparsed } when invalid, {} when empty).
 * @param opts.onEvent Optional event sink for tool_args_delta events.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Optional event sink for tool_args_delta events. */
        onEvent?: (event: types.models.StreamEvent) => void;
    },
): {
    start: (slot: string, id: string, name: string) => void;
    append: (slot: string, delta: string) => void;
    finish: () => types.models.StreamResult["toolCalls"];
} {
    const slots = new Map<string, { id: string; name: string; buf: string }>();
    return {
        start(slot, id, name) {
            const s = slots.get(slot);
            if (s) { if (id) s.id = id; if (name) s.name = name; }
            else slots.set(slot, { id, name, buf: "" });
        },
        append(slot, delta) {
            if (!delta) return;
            const s = slots.get(slot) ?? { id: "", name: "", buf: "" };
            slots.set(slot, s);
            s.buf += delta;
            opts.onEvent?.({ type: "tool_args_delta", delta, ...(s.id ? { id: s.id } : {}) });
        },
        finish() {
            return [...slots.values()].map(s => {
                let args: unknown = {};
                if (s.buf.trim()) { try { args = JSON.parse(s.buf); } catch { args = { __unparsed: s.buf }; } }
                return { id: s.id, name: s.name, args };
            });
        },
    };
}
