/**
 * Set or remove owner context-window overrides for models on one connection
 *
 * Public facade of models.catalog.setContextLimits. `limits` maps exact model ids to a positive safe integer of tokens or null (reset to provider metadata, else a public catalogue value, else 200,000). Atomic per-entry patch: unrelated overrides and availability stay unchanged; invalid patches are rejected whole with VALIDATION, unknown connections with NOT_FOUND. A local budget for compaction and context displays only — never sent upstream and cannot raise provider capacity.
 * @param opts.id Connection UUID.
 * @param opts.limits Model id → tokens (positive safe integer) or null to remove; 1–500 entries.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Model id → tokens (positive safe integer) or null to remove; 1–500 entries. */
        limits: Record<string, number | null>;
    },
): Promise<{ overrides: Record<string, number>; limits: Record<string, types.models.ContextLimit> }> {
    return ctx.fns.models.catalog.setContextLimits(opts);
}
