/**
 * Map raw Qwen gateway /models rows to SDK model descriptors
 *
 * Use only from models.provider.qwen.listModels. Keeps unique ids matching a conservative id pattern in catalogue order, sets protocol `openai-chat`, a positive integer `context_window_tokens` as contextWindow, and notes image input in the description only when `image` is among `input_modalities`; unknown modalities and malformed fields are ignored. Throws "Invalid model catalogue" when no usable model remains.
 * @param opts.rows Raw `data` array of the /models response.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Raw `data` array of the /models response. */
        rows: unknown[];
    },
): types.models.ModelInfo[] {
    const _ctx = ctx;
    const models: types.models.ModelInfo[] = [];
    const seen = new Set<string>();
    for (const row of opts.rows.slice(0, 2000)) {
        if (!row || typeof row !== "object") continue;
        const m = row as { id?: unknown; input_modalities?: unknown; context_window_tokens?: unknown };
        if (typeof m.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(m.id) || seen.has(m.id)) continue;
        seen.add(m.id);
        const context = Number(m.context_window_tokens);
        const image = Array.isArray(m.input_modalities) && m.input_modalities.includes("image");
        models.push({
            id: m.id, protocol: "openai-chat",
            ...(Number.isInteger(context) && context > 0 ? { contextWindow: context } : {}),
            ...(image ? { description: "Text and image input" } : {}),
        });
    }
    if (!models.length) throw new Error("Invalid model catalogue");
    return models;
}
