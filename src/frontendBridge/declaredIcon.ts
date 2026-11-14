/**
 * Turn a model provider's declared icon into an inert image data URL
 *
 * Use for provider marks from ProviderDefinition.icon. A Lucide icon name (PascalCase or kebab-case) is rendered from the bundled lucide-react icon data as a monochrome stroke SVG; an image data URL is passed through. Unknown names, other URLs and missing icons return null.
 * @param opts.icon Declared Lucide icon name or image data URL.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Declared Lucide icon name or image data URL. */
        icon?: string | null;
    },
): Promise<{ src: string; custom: boolean } | null> {
    const icon = String(opts.icon ?? "").trim();
    if (!icon) return null;
    if (/^data:image\/(svg\+xml|png|webp|gif|jpeg)[;,]/i.test(icon)) return { src: icon, custom: true };
    const name = icon.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Za-z])([0-9])/g, "$1-$2").toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return null;
    let data: { node?: [string, Record<string, string>][] } | undefined;
    try { data = (await import("lucide-react/dist/esm/icons/" + name + ".mjs") as { __iconData?: typeof data }).__iconData; }
    catch { return null; }
    if (!Array.isArray(data?.node)) return null;
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const body = data.node.filter(([tag]) => /^[a-z]+$/.test(tag)).map(([tag, attrs]) => "<" + tag + Object.entries(attrs).filter(([k]) => k !== "key" && /^[a-z-]+$/i.test(k)).map(([k, v]) => " " + k + '="' + esc(String(v)) + '"').join("") + "/>").join("");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + body + "</svg>";
    return { src: "data:image/svg+xml," + encodeURIComponent(svg), custom: false };
}
