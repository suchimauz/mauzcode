/**
 * Normalize an observed provider quota window without inventing missing usage.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** w input used by the codex windowOf protocol helper. */
        w: Record<string, unknown> | undefined;
        /** label input used by the codex windowOf protocol helper. */
        label: string;
        /** now input used by the codex windowOf protocol helper. */
        now: number;
    },
): NonNullable<types.models.UsageReport["windows"]>[number] | null {
    const { w, label, now } = opts;
    
        const used = Number(w?.used_percent);
        if (!w || !Number.isFinite(used)) return null;
        const direct = Number(w.resets_at ?? w.reset_at), after = Number(w.reset_after_seconds);
        const resetAt = Number.isFinite(direct) && direct > 0 ? direct * 1000 : Number.isFinite(after) ? now + after * 1000 : undefined;
        const minutes = Number.isFinite(Number(w.window_minutes)) ? Number(w.window_minutes) : Number.isFinite(Number(w.limit_window_seconds)) ? Number(w.limit_window_seconds) / 60 : NaN;
        const span = Number.isFinite(minutes) && minutes > 0 ? (minutes % 1440 === 0 ? `${minutes / 1440}d` : minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.round(minutes)}m`) : "";
        return { label: span ? `${label} (${span})` : label, usedPercent: Math.max(0, Math.min(100, used)), ...(resetAt ? { resetAt } : {}) };
}
