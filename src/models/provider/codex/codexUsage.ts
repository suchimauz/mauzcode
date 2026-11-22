/**
 * Read Codex subscription quota windows from `/backend-api/wham/usage`, classified by reported duration.
 *
 * Use from the Codex provider `usage` adapter. The general limit (`rate_limit`, or the `rate_limits` entry with
 * `limit_id: "codex"`) yields account-wide windows whose period comes only from `limit_window_seconds`/`window_minutes`
 * (18000 s → fiveHour, 604800 s → weekly), never from primary/secondary position. Every other valid entry in
 * `rate_limits` or `additional_rate_limits` is kept as an additional window with its own identity and `model` scope
 * when it names a model (otherwise `unknown`), even when its duration is standard. Entries without a finite
 * `used_percent` are skipped without hiding valid siblings. Throws when no valid window remains.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying scoped credentials and transport. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.UsageReport> {
    const { conn } = opts;
    const BASE = "https://chatgpt.com/backend-api";
    const a = await ctx.fns.models.provider.codex.codexWireAuth({ conn: conn });
    const res = await ctx.fns.models.provider.codex.codexWireChecked({ conn, auth: a, res: await conn.fetch(`${BASE}/wham/usage`, { headers: { authorization: `Bearer ${a.token}`, ...(a.accountId ? { "chatgpt-account-id": a.accountId } : {}), "user-agent": "codex-cli" } }) });
    const data = await res.json() as { rate_limit?: unknown; rate_limits?: unknown; additional_rate_limits?: unknown };
    const now = Date.now();
    type Entry = Record<string, unknown>;
    const obj = (v: unknown): Entry | undefined => v && typeof v === "object" && !Array.isArray(v) ? v as Entry : undefined;
    const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined;
    const list = (v: unknown) => Array.isArray(v) ? v.slice(0, 20).map(obj).filter((x): x is Entry => !!x) : [];
    const entries = list(data.rate_limits);
    const general = obj(data.rate_limit) ?? entries.find(x => x.limit_id === "codex");
    const windows: NonNullable<types.models.UsageReport["windows"]> = [];
    const slots = (detail: Entry | undefined, base: string, label: string, scope: "account" | "model" | "unknown", model?: string) => {
        if (!detail) return;
        for (const slot of ["primary", "secondary"] as const) {
            const w = ctx.fns.models.provider.codex.codexWireWindowOf({ w: obj(detail[`${slot}_window`] ?? detail[slot]), id: `${base}:${slot}`, label, scope, ...(model ? { model } : {}), now });
            if (w) windows.push(w);
        }
    };
    slots(general, "codex", "Codex", "account");
    const used = new Set<string>(["codex"]);
    const extras = [...entries.filter(x => x !== general), ...list(data.additional_rate_limits)];
    extras.forEach((entry, i) => {
        const name = text(entry.limit_name) ?? text(entry.name);
        const key = text(entry.limit_id) ?? text(entry.metered_feature) ?? name ?? `limit-${i + 1}`;
        if (used.has(key)) return;
        used.add(key);
        const model = text(entry.model) ?? text(entry.model_slug) ?? (entry.limit_name !== undefined ? name : undefined);
        slots(obj(entry.rate_limit) ?? entry, `codex:${key}`, name ?? key, model ? "model" : "unknown", model);
    });
    if (!windows.length) throw new Error("Codex usage response has no quota windows");
    return { status: "available", reason: "usage-ok", checkedAt: now, windows };
}
