/** Voice provider registry and active relay leases owned by the voice namespace. */
export type State = {
    providers?: Record<string, {
        /** Mounted module root that declared the provider; declarations follow their owner's lifetime. */
        owner: string;
        /** Dotted module of the declaration file, `app` for the application itself. */
        module: string;
        /** Path of the declaration inside its owner. */
        rel: string;
        /** Absolute path of the declaration, used to detect deletions on a full boot pass. */
        abs: string;
        definition: types.voice.ProviderDefinition;
    }>;
    /** Current dictation socket per authenticated owner and chat; survives endpoint reload. */
    socketSessions?: Map<string, { order: number; supersede: () => void }>;
    /** Order of start requests, so a delayed access check cannot supersede a newer lease. */
    socketStartOrder?: number;
};
