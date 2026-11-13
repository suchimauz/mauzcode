/**
 * Normalize an observed provider quota window without inventing missing usage.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** raw input used by the claude windowOf protocol helper. */
        raw: { utilization?: number; resets_at?: string } | undefined;
        /** label input used by the claude windowOf protocol helper. */
        label: string;
    },
): NonNullable<types.models.UsageReport["windows"]>[number] | undefined {
    const { raw, label } = opts;
    
        if (!raw || typeof raw.utilization !== "number" || !Number.isFinite(raw.utilization)) return undefined;
        const resetAt = Date.parse(raw.resets_at ?? "");
        return { label, usedPercent: Math.max(0, Math.min(100, raw.utilization)), ...(Number.isFinite(resetAt) ? { resetAt } : {}) };
}
