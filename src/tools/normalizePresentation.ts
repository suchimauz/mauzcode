// Validate a declared `presentation` block field by field.
//
// A bad field never makes the tool unavailable and never poisons its siblings:
// an unknown icon becomes the wrench, an unknown category "tools", a broken
// summary is dropped (the resolver's safe fallback applies) — each reported as
// a warning so the loader can say which declaration to fix.
const ICONS = [
    "file", "file-plus", "file-edit", "search", "terminal", "code", "answer", "checklist", "check",
    "delegate", "flag", "form", "canvas", "archive", "compass", "book", "target", "comment",
    "comment-check", "wrench",
] as const;
const CATEGORIES = ["files", "search", "commands", "agent", "git", "tools"] as const;

/**
 * Validates a tool declaration's presentation block and returns the usable fields with warnings.
 *
 * Use from the tool loader and the presentation resolver; unknown icon or category ids fall back to their defaults and a malformed summary template or unknown formatter is dropped, each with a warning.
 * @param opts.presentation The raw `presentation` value from a declaration; anything but an object is malformed.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** The raw `presentation` value from a declaration; anything but an object is malformed. */
        presentation: unknown;
    },
): { presentation: { label?: string; icon: string; category: string; summary?: string } | null; warnings: string[]; icons: string[]; categories: string[] } {
    const warnings: string[] = [];
    const base = { icons: [...ICONS] as string[], categories: [...CATEGORIES] as string[] };
    const raw = opts.presentation;
    if (raw === undefined || raw === null) return { presentation: null, warnings, ...base };
    if (typeof raw !== "object" || Array.isArray(raw)) {
        warnings.push("presentation must be an object; using defaults");
        return { presentation: null, warnings, ...base };
    }
    const p = raw as Record<string, unknown>;
    const out: { label?: string; icon: string; category: string; summary?: string } = { icon: "wrench", category: "tools" };

    if (typeof p.label === "string" && p.label.trim()) out.label = p.label.trim();
    else warnings.push("presentation.label must be a non-empty string; using the tool name");

    if (typeof p.icon === "string" && (ICONS as readonly string[]).includes(p.icon)) out.icon = p.icon;
    else warnings.push(`presentation.icon ${JSON.stringify(p.icon)} is not in the allow-list (${ICONS.join(", ")}); using "wrench"`);

    if (p.category !== undefined) {
        if (typeof p.category === "string" && (CATEGORIES as readonly string[]).includes(p.category)) out.category = p.category;
        else warnings.push(`presentation.category ${JSON.stringify(p.category)} is not one of ${CATEGORIES.join(", ")}; using "tools"`);
    }

    if (p.summary !== undefined) {
        if (typeof p.summary !== "string" || !p.summary.trim()) {
            warnings.push("presentation.summary must be a non-empty string; using the fallback summary");
        } else if (p.summary.startsWith("@")) {
            const check = ctx.fns.tools.summaryFormat({ formatter: p.summary });
            if (check.ok) out.summary = p.summary;
            else warnings.push(`presentation.summary: ${check.error}; using the fallback summary`);
        } else {
            const check = ctx.fns.tools.summaryTemplate({ template: p.summary });
            if (check.ok) out.summary = p.summary;
            else warnings.push(`presentation.summary: malformed template (${check.error}); using the fallback summary`);
        }
    }
    return { presentation: out, warnings, ...base };
}
