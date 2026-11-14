// One entry of the `edit` tool's `edits` array. Mirrors $tool_edit.md's schema.
// mode literal uses oldText/newText/all; mode anchor uses op/anchor/endAnchor/text.
export type EditOp = {
    /** mode anchor: the line op. mode literal: omitted or "replace". */
    op?: "replace" | "replaceLines" | "insertBefore" | "insertAfter" | "delete";
    /** mode literal — exact text to find (LF view); must match once in the lines read unless `all`. */
    oldText?: string;
    /** mode literal — what to put in its place; "" deletes. */
    newText?: string;
    /** mode literal — replace every occurrence in the lines read. */
    all?: boolean;
    /** mode anchor — an anchor from a hashline read inside the lines read (BOF/EOF for inserts). */
    anchor?: string;
    /** mode anchor — last anchor of the range. */
    endAnchor?: string;
    /** mode anchor — replacement or inserted lines. */
    text?: string;
};
