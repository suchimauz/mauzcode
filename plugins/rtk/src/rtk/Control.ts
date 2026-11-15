/** Instance-wide RTK control state as returned to owners and callers. Safe: contains no command output beyond the version line. */
export type Control = {
    /** Owner intent to apply RTK to local bash calls; not proof of health. */
    enabled: boolean;
    /** Monotonic revision; every transition increments it so stale checks cannot overwrite newer state. */
    revision: number;
    /** Latest check result: never checked, healthy and protocol-compatible, or failed. */
    availability: 'unknown' | 'available' | 'unavailable';
    /** Executable resolved on the server PATH by the latest check, if any. */
    path: string | null;
    /** Version reported by the latest successful `--version` call, e.g. "1.2.0". */
    version: string | null;
    /** Safe, human-readable reason for the latest failure or technical disablement. */
    reason: string | null;
    /** Epoch milliseconds of the latest completed check. */
    checkedAt: number | null;
};
