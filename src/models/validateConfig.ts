/**
 * Validate and normalize a connection configuration against its provider schema
 *
 * Use before storing a model connection. Rejects unknown providers, unknown keys, missing required fields, wrong value types, select values outside the declared options and non-HTTP(S) or credential-bearing URLs, applies declared defaults, accepts the core `models` key as a manual model id list, then runs the provider's own `validate`. Secret fields are checked separately from plain configuration: an omitted secret keeps the stored value, `null` clears it, a required secret must stay set. Never stores, logs or returns secret values; errors carry `code: "VALIDATION"` (or `UNKNOWN_PROVIDER`) and the offending `field`.
 * @param opts.provider Registered provider id.
 * @param opts.config Submitted non-secret configuration; the core key `models` holds manual model ids.
 * @param opts.secrets Submitted secret changes: string sets, null clears, absent keys keep the stored value.
 * @param opts.stored Secret field keys that currently hold a stored value (update only).
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Registered provider id. */
        provider: string;
        /** Submitted non-secret configuration; the core key `models` holds manual model ids. */
        config?: Record<string, unknown>;
        /** Submitted secret changes: string sets, null clears, absent keys keep the stored value. */
        secrets?: Record<string, unknown>;
        /** Secret field keys that currently hold a stored value (update only). */
        stored?: string[];
    },
): Promise<{ config: types.models.ResolvedConnection["config"]; secrets: Record<string, string | null> }> {
    return ctx.fns.models.connections.validateConfig(opts);
}
