// How a declared tool presents its calls in chat — the `presentation` block of
// a `$tool_<name>.md` declaration.
//
//   presentation:
//     label: Review comments          # human words, not the wire identifier
//     icon: comment                   # one id from the allow-list (tools.normalizePresentation)
//     category: git                   # files | search | commands | agent | git | tools
//     summary: "{path}[ · {status}]"  # template over arguments, or @formatter
//
// Template grammar (tools.summaryTemplate): `{key}` or `{key|filter}` with one
// filter from first-line, count, basename; a non-nested `[...]` segment renders
// only when every placeholder in it is non-empty; top-level ` || ` separates
// alternatives — the first whose required placeholders are all non-empty wins.
// A summary starting with `@` names a built-in formatter (@read, @edit,
// @search, @command, @code, @todos).
//
// Data, not code: the server resolves it per call with tools.presentation and
// sends label/icon/category/summary to every chat surface, so a running row and
// the finished row of the same call cannot disagree.
export type ToolPresentation = {
    /** Human label shown in the row, e.g. "Todos" for todo_update. */
    label: string;
    /** Icon id from the fixed allow-list; unknown ids fall back to "wrench". */
    icon: string;
    /** Row category: tints the icon and groups work. Defaults to "tools". */
    category?: string;
    /** Summary template or `@formatter`; omitted uses the safe fallback. */
    summary?: string;
};
