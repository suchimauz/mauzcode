/**
 * Return the Antigravity reasoning profile for a model without discovered reasoning levels
 *
 * reasoningProfile of the antigravity provider, consulted by models.stream only when the cached inventory gives the
 * model no reasoning variants (a standalone model or a catalogue cached before groups existed). It offers only `off`
 * as default, so any preference resolves to sending no thinking setting; it never invents levels that the account
 * inventory did not report.
 * @param opts.model Provider-native model id.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-native model id. */
        model: string;
    },
): types.models.ReasoningCapabilities | null {
    return { supported: ["off"], default: "off", source: "profile", profile: "antigravity-inventory-2026-11" };
}
