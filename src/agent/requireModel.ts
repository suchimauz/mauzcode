/**
 * Return an agent's selected model route or fail with MODEL_NOT_SELECTED
 *
 * Use before any model-dependent work (route resolution, compaction, context budget, goal capability, provider dispatch) for an agent whose model may be explicitly unset, for example after an archived agent was restored by the model-routes migration. Never fills a last-used or default model. The thrown error carries code MODEL_NOT_SELECTED, HTTP status 409 and non-retryable, replay-safe failure metadata so workers and retry policy stop without a provider request.
 * @param opts.model Stored agent model route; null, undefined or blank means no model is selected.
 * @param opts.agentId Agent identifier included in the safe error message.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Stored agent model route; null, undefined or blank means no model is selected. */
        model: string | null | undefined;
        /** Agent identifier included in the safe error message. */
        agentId?: string;
    },
): string {
    const model = typeof opts.model === 'string' ? opts.model : '';
    if (model.trim()) return model;
    const failure: types.models.FailureInfo = { code: 'MODEL_NOT_SELECTED', classification: 'invalid_input', acceptance: 'none', retryable: false, replaySafe: true };
    const subject = opts.agentId ? `Agent ${opts.agentId}` : 'This agent';
    throw Object.assign(new Error(`${subject} has no model selected; choose a model.`), { code: failure.code, status: 409, retryable: false, replaySafe: true, failure });
}
