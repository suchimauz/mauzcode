/**
 * Fixed user-facing sentence for one voice session error code
 *
 * Use wherever a code leaves the session core: the sentence is the only text a client sees for an abnormal end, so a
 * vendor payload, a raw exception message or key material can never reach it. Every code in the closed set has
 * exactly one sentence; an unknown code falls back to the generic provider sentence.
 * @param opts.code Closed session error code.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: { code: types.voice.ErrorCode },
): string {
    const sentences: Record<types.voice.ErrorCode, string> = {
        unauthorized: "Voice access was refused.",
        readOnly: "This chat can no longer be edited.",
        superseded: "Dictation moved to another tab.",
        unconfigured: "No voice model is configured.",
        routeUnavailable: "The selected voice route is unavailable.",
        providerAuth: "The voice provider rejected the connection credentials.",
        provider: "The voice provider failed.",
        timeout: "Voice recognition timed out.",
        backpressure: "Voice audio arrived faster than it could be transcribed.",
        protocol: "The voice session received invalid input.",
    };
    return sentences[opts.code] ?? sentences.provider;
}
