/**
 * Validate a configured API base URL and return it without trailing slashes.
 *
 * Use from shared protocol baseUrl methods before adding a version suffix. Accepts only absolute HTTP(S) URLs without credentials; any raw `?` or `#`, even with an empty query or fragment, is rejected. Throws exactly "Invalid base URL" without echoing the input.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Raw configured base URL text. */
        raw: string;
    },
): string {
    const raw = String(opts.raw);
    let url: URL;
    try { url = new URL(raw); }
    catch { throw new Error("Invalid base URL"); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || raw.includes("?") || raw.includes("#")) {
        throw new Error("Invalid base URL");
    }
    return url.href.replace(/\/+$/, "");
}
