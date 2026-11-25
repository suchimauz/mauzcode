/**
 * Map an Antigravity fetchAvailableModels response to per-native-model quota windows
 *
 * Pure. Reads `quotaInfo` of every provider-visible eligible native ID (models.provider.antigravity.inventory)
 * before any catalogue grouping, so each window stays attributable to one native model and its structured family;
 * local picker disables do not apply. `remainingFraction` in [0,1] becomes `usedPercent = 100 × (1 − fraction)` and a
 * valid `resetTime` becomes `resetAt`, each independently; a missing or invalid value stays absent (unknown, never
 * exhausted). Windows use `scope: "model"`, id `antigravity:<native id>` and no period; nothing is pooled or inferred.
 * @param opts.response Parsed fetchAvailableModels response.
 * @param opts.observedAt Epoch milliseconds of this observation.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Parsed fetchAvailableModels response. */
        response: Record<string, unknown>;
        /** Epoch milliseconds of this observation. */
        observedAt: number;
    },
): NonNullable<types.models.UsageReport["windows"]> {
    return ctx.fns.models.provider.antigravity.inventory({ response: opts.response }).map(m => ({
        label: m.label ?? m.id, id: "antigravity:" + m.id, scope: "model" as const, model: m.id, family: m.family, observedAt: opts.observedAt,
        ...(m.remainingFraction !== undefined ? { usedPercent: 100 * (1 - m.remainingFraction) } : {}),
        ...(m.resetAt !== undefined ? { resetAt: m.resetAt } : {}),
    }));
}
