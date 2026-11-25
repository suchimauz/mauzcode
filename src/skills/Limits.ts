/** Documented budgets enforced by bounded package discovery and reading, exposed as data by skills.packageLimits. */
export type Limits = {
    /** Immediate packages returned by one scan at most; further entries are reported as truncated. */
    packages: number;
    /** Container entries examined per scan at most; further names are reported as truncated. */
    entries: number;
    /** SKILL.md bytes read at discovery at most: bytes through the closing --- line, never the body. */
    headerBytes: number;
    /** Total SKILL.md bytes one instruction read may take at most. */
    instructionsBytes: number;
    /** Regular files reported for one package at most. */
    resources: number;
    /** Directory entries examined while inventorying one package at most. */
    resourceEntries: number;
    /** Directory nesting depth followed for packaged resources at most, counting the package itself as depth 0. */
    depth: number;
    /** Bytes one resource read may return at most. */
    resourceBytes: number;
    /** Verified regular-file bytes one whole package may hold at most; a larger package is reported as oversized instead of read. */
    packageBytes: number;
    /** Bytes one continuation page of one resource may return at most. */
    pageBytes: number;
    /** Diagnostics reported per scan at most; further problems count as truncation. */
    diagnostics: number;
    /** Characters kept in one diagnostic or clipped name at most. */
    diagnosticChars: number;
};
