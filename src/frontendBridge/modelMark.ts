/**
 * Resolve the brand mark image for a model route or provider
 *
 * Use for every UI surface that shows a model or provider mark (pickers, navigation chats, chat header, quota cards, Models settings) so the same model or provider always gets the same image. With a model it uses the brand recognised from the model id (ui.modelLogo: OpenAI, Anthropic, Google, Qwen, Meta, Mistral, DeepSeek, xAI, Kimi, Z.ai, MiniMax); otherwise the provider brand (claude → Anthropic, codex → OpenAI); otherwise the registered provider's declared icon, then the generic Lucide plug. Shared brand marks are inert SVG data URLs with custom:false; declared image data URLs preserve custom:true. Returns null only when neither model nor provider is given. Custom chat icons are not handled here; use frontendBridge.iconData for chats.
 * @param opts.model Model route provider/accountName:modelId (or a legacy id); its model id decides the brand first.
 * @param opts.provider Provider id (claude, codex, custom, …) used when the model has no recognised brand or is absent; defaults to the route's provider.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model route provider/accountName:modelId (or a legacy id); its model id decides the brand first. */
        model?: string | null;
        /** Provider id (claude, codex, custom, …) used when the model has no recognised brand or is absent; defaults to the route's provider. */
        provider?: string | null;
    },
): Promise<{ src: string; custom: boolean } | null> {
    const brand = (model: string) => {
            const markup = ctx.fns.ui.modelLogo({ model, bare: true });
            const start = markup.indexOf("<svg"), end = markup.indexOf("</svg>", start);
            if (start < 0 || end < 0) return null;
            const svg = markup.slice(start, end + 6);
            const image = svg.includes("xmlns=") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
            return { src: "data:image/svg+xml," + encodeURIComponent(image), custom: false };
        };
        const model = String(opts.model ?? "").trim();
        // Providers come from the route itself when not given separately.
        const provider = String(opts.provider ?? "").trim() || (model.includes("/") ? model.slice(0, model.indexOf("/")) : "");
        if (model) { const mark = brand(model); if (mark) return mark; }
        if (provider) { const mark = brand(provider + ":x"); if (mark) return mark; }
        if (provider) {
            const declared = ctx.fns.models.providers({}).find(p => p.id === provider)?.icon;
            const mark = await ctx.fns.frontendBridge.declaredIcon({ icon: declared });
            if (mark) return mark;
        }
        if (!model && !provider) return null;
        return ctx.fns.frontendBridge.declaredIcon({ icon: "plug" });
}
