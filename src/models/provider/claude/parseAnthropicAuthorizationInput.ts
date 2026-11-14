/**
 * Parse Claude OAuth codes and callback state from pasted authorization input
 *
 * Use inside models for provider wire compatibility without the legacy runtime. Preserves existing transcript, authentication or client identity behavior.
 * @param opts.input Authorization response, callback URL, or code to parse.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authorization response, callback URL, or code to parse. */
        input: string;
    },
): { code: string | null; state: string | null } {
    const value = String(opts.input ?? "").trim();
        if (!value) return { code: null, state: null };
        try {
            const u = new URL(value);
            return { code: u.searchParams.get("code"), state: u.searchParams.get("state") };
        } catch { /* not a URL */ }
        if (value.includes("#")) {
            const [code, state] = value.split("#", 2);
            return { code: code || null, state: state || null };
        }
        if (value.includes("code=")) {
            const p = new URLSearchParams(value);
            return { code: p.get("code"), state: p.get("state") };
        }
        return { code: value, state: null };
}
