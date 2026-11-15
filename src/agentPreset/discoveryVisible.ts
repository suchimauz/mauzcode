/**
 * Checks required live capabilities before advertising a scoped kind or guidance block.
 *
 * Use for capability discovery only, never action authorization. Unscoped internal callers retain all entries; scoped callers require nonempty metadata and every dependency to be live and permitted.
 * @param opts.requires Exact runtime function names required to use the advertised capability, including its public entrypoint.
 * @param opts.allows Optional agent snapshot predicate; omission preserves unscoped internal discovery.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact runtime function names required to use the advertised capability, including its public entrypoint. */
        requires?: string[];
        /** Optional agent snapshot predicate; omission preserves unscoped internal discovery. */
        allows?: (name: string) => boolean;
    },
): boolean {
    if (!opts.allows) return true;
    if (!Array.isArray(opts.requires) || !opts.requires.length) return false;
    return opts.requires.every(name => {
     if (typeof name !== "string" || !/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)+$/.test(name)) return false;
     let node: unknown = ctx.state.registry;
     for (const key of name.split(".")) {
      if (!node || typeof node !== "object") return false;
      node = Object.getOwnPropertyDescriptor(node, key)?.value;
     }
     return typeof node === "function" && opts.allows!(name);
    });
}
