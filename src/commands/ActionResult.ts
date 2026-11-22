/** An immediate result, or a deferred completion owned by the handler. */
export type ActionResult = {
    status: 'completed' | 'running';
    result: types.commands.Json;
    /** Optional public lifecycle summary. */ summary?: string;
    /** Backwards-compatible scheduling and planning fields on the HTTP response. */
    response?: { scheduled?: boolean; planning?: types.planning.State; messageIdx?: number; sendAt?: number; attachments?: never[] };
};
