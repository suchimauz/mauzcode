/** One file of a staged skill package: package-relative path, exact bytes and executable bit. */
export type StagedFile = {
    /** Package-relative slash path, e.g. SKILL.md or scripts/check.sh. */
    path: string;
    /** Base64 of the exact file bytes. */
    data: string;
    /** True when the file keeps an executable permission bit. */
    executable: boolean;
    /** True when the bytes come from a separately proposed adaptation rather than the source. */
    adapted?: boolean;
};
