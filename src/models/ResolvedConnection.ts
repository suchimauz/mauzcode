/** Provider-facing connection. Only this connection's secrets and bound transport are exposed. */
export type ResolvedConnection = {
    id: string;
    provider: string;
    accountName: string;
    /** Non-secret configuration only; manually configured models may be a string array. */
    config: Record<string, string | number | boolean | string[] | null>;
    /** Lazily decrypt a declared secret field; absent secrets return null. Never log the result. */
    secret: (key: string) => Promise<string | null>;
    /** Inference only: attest the exact provider-managed login tuple that is being sent. Missing evidence disables native search for that reply. */
    attestNativeWebSearch?: (proof: types.models.NativeWebSearchProof) => void;
    /** Send HTTP using the connection's transport; never fall back to a direct request. */
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
};
