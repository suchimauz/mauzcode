/**
 * Validate and compile a full-name preset glob; only star is special and includes dots.
 * Reject malformed definitions before storage rather than interpreting regex syntax.
 * @param opts.pattern Nonempty function glob using letters, digits, underscore, dot, star, dollar or hyphen.
 */
export default function (_ctx: Context, _session: Session | null, opts: { pattern: string }): RegExp {
    if (typeof opts.pattern !== 'string' || !/^[A-Za-z0-9_.*$-]+$/.test(opts.pattern)) throw new Error(`Invalid function pattern: ${String(opts.pattern)}`);
    return new RegExp('^' + opts.pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
}
