/** Durable result of one replay-safe trigger action; identical retries return the stored value with duplicate:true. */
export type TriggerActionResult = {
    /** True when the requested state change was applied. */
    ok: boolean;
    /** Requested action. */
    action: 'run' | 'cancel';
    /** Exact requested trigger. */
    triggerId: string;
    /** Idempotency key. */
    requestId: string;
    /** Actual outcome: run-now outcomes, a committed cancellation, a no-op on a finished/foreign target, or blocked by planning mode. */
    outcome: 'scheduled' | 'deferred_paused' | 'already_checking' | 'not_active' | 'cancelled' | 'planning';
    /** Kind of the owned target, when it exists. */
    kind?: string;
    /** Display purpose of the owned target, when it exists. */
    purpose?: string;
    /** Commit time in milliseconds. */
    at: number;
    /** Set when this is a replay of a stored result. */
    duplicate?: boolean;
};
