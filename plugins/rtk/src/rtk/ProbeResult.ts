/** Outcome of one bounded RTK availability probe. */
export type Probe = {
    /** True only when `--version` and a fixed rewrite probe both behaved like a compatible RTK. */
    ok: boolean;
    /** Resolved executable path, null when RTK is not on PATH. */
    path: string | null;
    /** Parsed version, null when unknown. */
    version: string | null;
    /** Machine-readable failure class. */
    code: 'ok' | 'missing' | 'permission' | 'signal' | 'timeout' | 'overflow' | 'spawn' | 'incompatible' | 'policy';
    /** Safe failure reason for owners, null on success. */
    reason: string | null;
};
