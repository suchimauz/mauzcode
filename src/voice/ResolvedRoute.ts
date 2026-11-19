/**
 * A voice route resolved against current registrations, stored connections and the model catalogue.
 *
 * The resolution carries exactly the connection the route names: there is no substitute connection and no
 * fallback route. The disclosed destination and the negotiated sample rate let a session announce where audio
 * goes before capture; no handler, secret value or `secret://` reference is ever part of a resolved route.
 */
export type ResolvedRoute = types.voice.VoiceRoute & {
    /** Original route string, preserved exactly. */
    route: string;
    /** Stored connection UUID behind the account name. */
    connectionId: string;
    /** Where the captured audio is processed; disclosed before the microphone is opened. */
    destination: types.voice.Destination;
    /** The catalogued model the route names, with its capabilities. */
    model: types.voice.VoiceModel;
    /** Sample rate core negotiates for this model: the first declared entry, per the SDK contract. */
    sampleRate: number;
};
