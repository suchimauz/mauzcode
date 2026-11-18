/** Safe display projection of one armed (active or checking) trigger for the chat panel. */
export type ArmedTrigger = {
    /** Trigger identifier. */
    id: string;
    /** One-shot wake, recurring cron or condition watch. */
    kind: 'at' | 'cron' | 'watch';
    /** Waiting, or currently being checked by the worker. */
    status: 'active' | 'checking';
    /** First prompt line, collapsed and truncated to 120 characters. */
    purpose: string;
    /** Next due time (wake/cron) or next check (watch), epoch ms. */
    nextAt: number | null;
    /** Cron expression, cron only. */
    cronExpression?: string | null;
    /** IANA time zone, cron only. */
    timezone?: string | null;
    /** Watch firing mode, watch only. */
    mode?: 'once' | 'edge';
    /** Watch expiry time, watch only. */
    timeoutAt?: number | null;
};
