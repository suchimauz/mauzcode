/**
 * Map an Antigravity retrieveUserQuotaSummary response to group/period quota windows
 *
 * Pure. Reads `groups[].buckets[]` by structured identity only: the general buckets `gemini-5h`/`gemini-weekly`
 * (family `gemini`) and `3p-5h`/`3p-weekly` (family `claude`, the shared Claude/GPT pool) become `scope: "group"`
 * windows with `period` `fiveHour`/`weekly`, but only when their structured `window` (`5h`/`weekly`) matches the ID.
 * Every other bucket with a usable `bucketId` is kept as an additional window (`scope: "unknown"`) with its own
 * identity; it carries the family of its group only when that group's general buckets name exactly one family.
 * `remainingFraction` in [0,1] becomes `usedPercent = 100 × (1 − fraction)` (binary rounding noise removed) and a valid `resetTime` becomes
 * `resetAt`, each independently; missing or invalid values stay absent. A bucket ID reported more than once, or a
 * general ID with a mismatching window or in another family's group, is conflicting and fills nothing — array order
 * never wins. Display names never classify. Throws INVALID_RESPONSE when the envelope has no `groups` array (a failed
 * read, not an empty observation).
 * @param opts.response Parsed retrieveUserQuotaSummary response.
 * @param opts.observedAt Epoch milliseconds of this observation.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Parsed retrieveUserQuotaSummary response. */
        response: Record<string, unknown>;
        /** Epoch milliseconds of this observation. */
        observedAt: number;
    },
): NonNullable<types.models.UsageReport["windows"]> {
    const groups = (opts.response as { groups?: unknown }).groups;
    if (!Array.isArray(groups)) throw Object.assign(new Error("Antigravity quota summary returned invalid data"), { code: "INVALID_RESPONSE" });
    const GENERAL: Record<string, { family: "gemini" | "claude"; window: string; period: "fiveHour" | "weekly" }> = {
        "gemini-5h": { family: "gemini", window: "5h", period: "fiveHour" }, "gemini-weekly": { family: "gemini", window: "weekly", period: "weekly" },
        "3p-5h": { family: "claude", window: "5h", period: "fiveHour" }, "3p-weekly": { family: "claude", window: "weekly", period: "weekly" },
    };
    const PERIOD: Record<string, "fiveHour" | "weekly"> = { "5h": "fiveHour", weekly: "weekly" };
    type Bucket = { id: string; group: number; window?: string; label?: string; fraction?: number; resetAt?: number };
    const buckets: Bucket[] = [];
    groups.forEach((g, group) => {
        const list = g && typeof g === "object" && !Array.isArray(g) ? (g as { buckets?: unknown }).buckets : undefined;
        for (const b of Array.isArray(list) ? list : []) {
            if (!b || typeof b !== "object" || Array.isArray(b)) continue;
            const r = b as Record<string, unknown>;
            const id = typeof r.bucketId === "string" ? r.bucketId.trim() : "";
            if (!id || id.length > 100) continue;
            const fraction = typeof r.remainingFraction === "number" && Number.isFinite(r.remainingFraction) && r.remainingFraction >= 0 && r.remainingFraction <= 1 ? r.remainingFraction : undefined;
            const reset = typeof r.resetTime === "string" && r.resetTime.length <= 64 ? Date.parse(r.resetTime) : NaN;
            buckets.push({ id, group, ...(typeof r.window === "string" ? { window: r.window } : {}),
                ...(typeof r.displayName === "string" && r.displayName.trim() ? { label: r.displayName.trim().slice(0, 100) } : {}),
                ...(fraction !== undefined ? { fraction } : {}), ...(Number.isFinite(reset) && reset > 0 ? { resetAt: reset } : {}) });
        }
    });
    const count = new Map<string, number>();
    for (const b of buckets) count.set(b.id, (count.get(b.id) ?? 0) + 1);
    // A group's family comes only from the general buckets it contains, and only when they agree.
    const groupFamily = new Map<number, "gemini" | "claude" | null>();
    for (const b of buckets) {
        const f = GENERAL[b.id]?.family;
        if (!f) continue;
        const cur = groupFamily.get(b.group);
        groupFamily.set(b.group, cur === undefined || cur === f ? f : null);
    }
    const out: NonNullable<types.models.UsageReport["windows"]> = [];
    for (const b of buckets) {
        if (count.get(b.id) !== 1) continue;
        const g = Object.hasOwn(GENERAL, b.id) ? GENERAL[b.id] : undefined;
        const values = { observedAt: opts.observedAt, ...(b.fraction !== undefined ? { usedPercent: Math.round(1e9 * 100 * (1 - b.fraction)) / 1e9 } : {}), ...(b.resetAt !== undefined ? { resetAt: b.resetAt } : {}) };
        if (g) {
            if (b.window !== g.window || groupFamily.get(b.group) !== g.family) continue;
            out.push({ label: b.label ?? b.id, id: "antigravity:" + b.id, bucket: b.id, scope: "group", family: g.family, period: g.period, ...values });
            continue;
        }
        const family = groupFamily.get(b.group) ?? undefined;
        const period = b.window !== undefined && Object.hasOwn(PERIOD, b.window) ? PERIOD[b.window] : undefined;
        out.push({ label: b.label ?? b.id, id: "antigravity:" + b.id, bucket: b.id, scope: "unknown", ...(family ? { family } : {}), ...(period ? { period } : {}), ...values });
    }
    return out;
}
