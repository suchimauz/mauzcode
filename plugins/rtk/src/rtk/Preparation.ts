/**
 * Outcome of preparing one local bash command with RTK, decided before the command starts.
 *
 * - `execute`: run `command` exactly once (the RTK replacement or the original); never retry after it starts.
 * - `deny`: RTK rewrite returned exit 2; nothing may be executed, not even the original.
 * - `timeout`: the caller's deadline ran out during preparation; nothing may be executed.
 */
export type Preparation = {
    /** What the caller must do next. */
    action: 'execute' | 'deny' | 'timeout';
    /** Command to execute for `execute`; the original command otherwise. */
    command: string;
    /** The command exactly as the caller supplied it. */
    original: string;
    /**
     * How preparation ended: `inactive` (RTK disabled or not verified, RTK not consulted for rewriting), `rewritten`
     * (exit 0/3 replacement, possibly identical), `unchanged` (exit 1, original kept), `denied` (exit 2),
     * `fallback` (technical failure: RTK was disabled and the original runs), `stale` (RTK was disabled or reloaded
     * during preparation, original runs), `deadline` (caller deadline exhausted, nothing runs).
     */
    outcome: 'inactive' | 'rewritten' | 'unchanged' | 'denied' | 'fallback' | 'stale' | 'deadline';
    /** Exit code of `rtk rewrite`, when it finished normally. */
    code: number | null;
    /** Brief safe notice for the tool result (technical disablement), null when none is needed. */
    notice: string | null;
    /** RTK's own denial message for exit 2 (may be empty); not yet redacted — the caller masks secrets. */
    diagnostic: string | null;
    /** Executable path that prepared the command, when RTK was consulted. */
    path: string | null;
};
