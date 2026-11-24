/** Portable Agent Skills manifest fields as read from one SKILL.md frontmatter. */
export type Manifest = {
    /** Upstream short name, kept verbatim and equal to the package directory name. */
    name: string;
    /** What the skill does and when to use it, non-blank, at most 1024 characters. */
    description: string;
    /** License text or reference exactly as supplied. */
    license?: string;
    /** Requirement text exactly as supplied, at most 500 characters. */
    compatibility?: string;
    /** Upstream metadata map, preserved key by key. */
    metadata?: Record<string, string>;
    /** Upstream allowed-tools value preserved verbatim as a single string, e.g. Read Grep. */
    'allowed-tools'?: string;
};
