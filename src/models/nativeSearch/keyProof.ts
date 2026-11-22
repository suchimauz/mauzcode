/**
 * Read the local revision of one SDK-managed model key.
 *
 * Locks the encrypted row for the current transaction. The opaque revision covers replacement, deletion and reinsertion; this operation does not decrypt or return a credential.
 * @param opts.id Model connection UUID owning the declared key.
 * @param opts.field Declared secret field selected by the model provider.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model connection UUID owning the declared key. */
        id: string;
        /** Declared secret field selected by the model provider. */
        field: string;
    },
): Promise<types.models.NativeWebSearchProof | null> {
    const name = opts.id + '.' + opts.field;
    const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT encode(sha256(convert_to(value_enc,\'UTF8\')),\'hex\') AS envelope, version FROM local_secrets WHERE namespace=? AND name=? FOR SHARE', params: ['models', name] });
    return row ? Object.freeze({ generation: opts.id, revision: String(row.version) + ':' + row.envelope }) : null;
}
