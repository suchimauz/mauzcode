/**
 * Returns the browser tab icon of this MauzCode instance as a data URL
 *
 * Resolves the favicon every page shell inlines: the instance override stored by ui.setFavicon (setting ui.favicon, or MAUZCODE_FAVICON) when present, otherwise the built-in MauzCode brand icon (src/ui/assets/icon.svg, a cat face drawn from code braces). Use it when rendering a standalone HTML document that should carry the instance icon.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<string> {
    const custom = String(await ctx.fns.settings.getString({ module: "ui", scopeType: "global", key: "favicon", fallback: "" }) ?? "").trim();
        if (/^data:image\//.test(custom)) return custom;
        // The canonical brand mark; every raster icon is generated from the same file (script/generate-icons.ts).
        const svg = (await Bun.file(new URL("./assets/icon.svg", import.meta.url)).text()).trim();
        return "data:image/svg+xml," + encodeURIComponent(svg);
}
