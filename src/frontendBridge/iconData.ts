/**
 * Expose an inert custom SVG or native model-provider mark for React navigation
 *
 * Use for navigation icons without injecting SVG markup into the document. Custom images preserve colors; otherwise the mark comes from frontendBridge.modelMark (model-id brand, then provider brand, then the generic plug), a monochrome mask driven by the current UI theme. Returns null only without both icon and model.
 * @param opts.icon Stored custom SVG, preferred when present.
 * @param opts.model Native MauzCode model identifier used for the shared model mark fallback.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Stored custom SVG, preferred when present. */
        icon?: string | null;
        /** Native MauzCode model identifier used for the shared model mark fallback. */
        model?: string | null;
    },
): Promise<{src:string;custom:boolean} | null> {
    if(!opts.icon?.trim())return ctx.fns.frontendBridge.modelMark({model:opts.model??null});
    const custom=true;
    const markup=opts.icon.trim();
    const start=markup.indexOf("<svg"),end=markup.indexOf("</svg>",start);
    if(start<0||end<0)return null;
    const svg=markup.slice(start,end+6);
    const image=svg.includes("xmlns=")?svg:svg.replace("<svg",'<svg xmlns="http://www.w3.org/2000/svg"');
    return {src:"data:image/svg+xml,"+encodeURIComponent(image),custom};
}
