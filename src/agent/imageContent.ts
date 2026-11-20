import { resolve } from "node:path";
import sizeOf from "buffer-image-size";

/** Encodes a supported workspace image for inline model inspection, rejecting oversized images before attachment. */
export default async function (
    _ctx: Context,
    session: Session | null,
    opts: {
        /** Local image path, absolute or relative to the agent workspace. */
        path: string;
    },
): Promise<types.tools.Content> {
    const base = session?.agent?.workspaceHost ? process.cwd() : (session?.agent?.workspaceDir || process.cwd());
    const path = resolve(base, opts.path);
    const file = Bun.file(path);
    if (!await file.exists()) throw new Error(`image not found: ${path}`);
    // Keep the existing 4.5 MiB base64 ceiling without allocating an unbounded buffer.
    const maxBytes = 4.5 * 1024 * 1024 * 3 / 4;
    const recovery = "Capture just the viewport (fullPage: false), or crop/resize a copy and read that instead. The original is unchanged.";
    const bytes = Buffer.from(await file.slice(0, maxBytes + 1).arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`image exceeds the 4.5 MB inline limit. ${recovery}`);
    const mimeType = sniff(bytes);
    if (!mimeType) throw new Error("unsupported image (expected PNG, JPEG, GIF, or WebP)");
    // A tall, highly compressed screenshot can fit the byte limit but still
    // invalidate later multi-image requests. Bound each axis independently.
    let dimensions;
    try {
        dimensions = sizeOf(bytes);
    } catch {
        throw new Error(`Cannot determine image dimensions. ${recovery}`);
    }
    const { width, height } = dimensions;
    if (!(width > 0 && height > 0)) throw new Error(`Invalid image dimensions. ${recovery}`);
    const maxEdge = 3000;
    if (width > maxEdge || height > maxEdge) {
        throw new Error(`Image is ${width}x${height}; inline images must be at most ${maxEdge} px on each side. ${recovery}`);
    }
    return { type: "image", data: bytes.toString("base64"), mimeType };
}

function sniff(b: Uint8Array): string | null {
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length >= 6 && String.fromCharCode(...b.slice(0, 6)) .startsWith("GIF8")) return "image/gif";
    if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
    return null;
}
