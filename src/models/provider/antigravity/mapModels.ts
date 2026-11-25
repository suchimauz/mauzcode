/**
 * Map an Antigravity fetchAvailableModels response to the account's Gemini and Claude catalogue choices
 *
 * Pure. Starts from models.provider.antigravity.inventory (visible, enabled, Google or Anthropic entries in provider
 * order). Each `groupedModels[key]` becomes one choice with the group key as id: every `supportedThinkingLevels[]
 * .thinkingSuffix` that is an SDK reasoning level and whose `<key>-<suffix>` is an existing eligible native ID with
 * thinking not disabled becomes a `reasoning.variants` member, in provider listing order; the concatenation is a
 * lookup, never an invented ID. `defaultAgentModelId` is the default member only when it is one of them. A group
 * limit is the lowest member limit and only when every member reports it. A group with no member is not offered.
 * A group whose key is itself a visible native ID, whose members span families, or that shares a member with
 * another group is ambiguous: it gets no choices and its native models stay standalone. Eligible IDs outside a
 * verified group are standalone choices with their own limits and no reasoning levels. No prices.
 * @param opts.response Parsed fetchAvailableModels response.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Parsed fetchAvailableModels response. */
        response: Record<string, unknown>;
    },
): types.models.ModelInfo[] {
    const natives = ctx.fns.models.provider.antigravity.inventory({ response: opts.response });
    const byId = new Map(natives.map((m, i) => [m.id, { ...m, order: i }] as const));
    const r = opts.response as { groupedModels?: unknown; defaultAgentModelId?: unknown };
    const grouped = r.groupedModels && typeof r.groupedModels === "object" && !Array.isArray(r.groupedModels) ? r.groupedModels as Record<string, Record<string, unknown> | null> : {};
    const levels: types.models.ReasoningLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
    type Group = { key: string; label?: string; members: { level: types.models.ReasoningLevel; id: string; order: number }[]; ambiguous: boolean };
    const groups: Group[] = [];
    const claims = new Map<string, Group[]>();
    for (const [key, raw] of Object.entries(grouped)) {
        if (!key || key.length > 200 || /\s/.test(key) || !raw || typeof raw !== "object") continue;
        const group: Group = { key, ...(typeof raw.displayName === "string" && raw.displayName.trim() ? { label: raw.displayName.trim().slice(0, 200) } : {}), members: [], ambiguous: byId.has(key) };
        for (const entry of Array.isArray(raw.supportedThinkingLevels) ? raw.supportedThinkingLevels : []) {
            const suffix = entry && typeof entry === "object" ? (entry as { thinkingSuffix?: unknown }).thinkingSuffix : undefined;
            if (typeof suffix !== "string" || !levels.includes(suffix as types.models.ReasoningLevel)) continue;
            const native = byId.get(`${key}-${suffix}`);
            if (!native || !native.thinking) continue;
            // The same level twice is not an unambiguous choice.
            if (group.members.some(m => m.level === suffix)) { group.ambiguous = true; continue; }
            group.members.push({ level: suffix as types.models.ReasoningLevel, id: native.id, order: native.order });
            claims.set(native.id, [...(claims.get(native.id) ?? []), group]);
        }
        if (new Set(group.members.map(m => byId.get(m.id)!.family)).size > 1) group.ambiguous = true;
        groups.push(group);
    }
    for (const claimed of claims.values()) if (claimed.length > 1) for (const g of claimed) g.ambiguous = true;
    const verified = groups.filter(g => !g.ambiguous && g.members.length);
    const member = new Set(verified.flatMap(g => g.members.map(m => m.id)));
    const out: { order: number; info: types.models.ModelInfo }[] = [];
    for (const g of verified) {
        const members = [...g.members].sort((a, b) => a.order - b.order);
        const of = members.map(m => byId.get(m.id)!);
        const limit = (key: "contextWindow" | "maxOutputTokens") => of.every(m => m[key] !== undefined) ? Math.min(...of.map(m => m[key]!)) : undefined;
        const contextWindow = limit("contextWindow"), maxOutputTokens = limit("maxOutputTokens");
        const def = typeof r.defaultAgentModelId === "string" && members.some(m => m.id === r.defaultAgentModelId) ? r.defaultAgentModelId : undefined;
        out.push({ order: members[0]!.order, info: {
            id: g.key, ...(g.label ? { label: g.label } : {}), ...(contextWindow ? { contextWindow } : {}), ...(maxOutputTokens ? { maxOutputTokens } : {}),
            reasoning: { supported: members.map(m => m.level), variants: { members: members.map(m => ({ level: m.level, id: m.id })), ...(def ? { default: def } : {}) } },
            family: of[0]!.family,
        } });
    }
    for (const m of natives) {
        if (member.has(m.id)) continue;
        out.push({ order: byId.get(m.id)!.order, info: { id: m.id, ...(m.label ? { label: m.label } : {}), ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}), ...(m.maxOutputTokens ? { maxOutputTokens: m.maxOutputTokens } : {}), family: m.family } });
    }
    // One listing: a group takes the position of its first visible member.
    return out.sort((a, b) => a.order - b.order).map(o => o.info);
}
