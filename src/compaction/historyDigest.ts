import { createHash } from 'node:crypto';

/** Fingerprint the ordered canonical source of a compact checkpoint, including message indices and tool attachments. Only this digest is persisted, never additional transcript content. */
export default function (
    _ctx: Context, _session: Session | null,
    opts: {
        /** Canonical messages through the source frontier, not the compact projection. */
        messages: types.session.Message[];
    },
): string {
    const hash = createHash('sha256');
    for (const row of opts.messages) {
        hash.update(JSON.stringify(row, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value));
        hash.update('\n');
    }
    return hash.digest('hex');
}
