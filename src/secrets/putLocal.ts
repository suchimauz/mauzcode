/**
 * Encrypt and persist one local runtime secret
 *
 * Upserts a secret into encrypted Postgres local storage. Use for mutable OAuth tokens and bootstrap-cached static credentials.
 * @param opts.namespace Logical owner such as google.
 * @param opts.name Stable secret key such as token:user@example.com.
 * @param opts.value Plain-text value to encrypt and persist.
 * @param opts.source Origin metadata such as op-bootstrap, oauth, or refresh. @default local
 * @param opts.ifAbsent Insert only when no entry exists; never overwrite an existing value (created reports whether this call stored it). @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Logical owner such as google. */
        namespace: string;
        /** Stable secret key such as token:user@example.com. */
        name: string;
        /** Plain-text value to encrypt and persist. */
        value: string;
        /** Origin metadata such as op-bootstrap, oauth, or refresh. @default local */
        source?: string;
        /** Insert only when no entry exists; never overwrite an existing value (created reports whether this call stored it). @default false */
        ifAbsent?: boolean;
    },
): Promise<{ ok: true; version: number; created: boolean }> {
    const namespace = String(opts.namespace ?? "").trim();
        const name = String(opts.name ?? "").trim();
        if (!namespace || !name) throw new Error("local secret namespace and name are required");
        const envelope = await ctx.fns.secrets.encryptLocal({ namespace, name, value: opts.value });
        const now = Date.now();
        if (opts.ifAbsent) {
            const inserted = await ctx.fns.procs.db.select({ sql: `INSERT INTO local_secrets(namespace,name,value_enc,source,version,created_at,updated_at)
                VALUES (?,?,?,?,1,?,?) ON CONFLICT(namespace,name) DO NOTHING RETURNING version`, params: [namespace,name,envelope,String(opts.source ?? "local"),now,now] }) as any[];
            if (inserted[0]) return { ok: true, version: Number(inserted[0].version ?? 1), created: true };
            const existing = await ctx.fns.procs.db.select({ sql: "SELECT version FROM local_secrets WHERE namespace=? AND name=?", params: [namespace,name] }) as any[];
            return { ok: true, version: Number(existing[0]?.version ?? 1), created: false };
        }
        const result = await ctx.fns.procs.db.select({ sql: `INSERT INTO local_secrets(namespace,name,value_enc,source,version,created_at,updated_at)
            VALUES (?,?,?,?,1,?,?) ON CONFLICT(namespace,name) DO UPDATE SET value_enc=excluded.value_enc,
            source=excluded.source,version=local_secrets.version+1,updated_at=excluded.updated_at RETURNING version`, params: [namespace,name,envelope,String(opts.source ?? "local"),now,now] }) as any[];
        return { ok: true, version: Number(result[0]?.version ?? 1), created: Number(result[0]?.version ?? 1) === 1 };
}
