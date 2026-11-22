/** Configuration status reported by a provider's optional status handler. */
export type ProviderStatus = {
    /** Whether the provider can search right now without further setup. */
    configured: boolean;
    /** Short, secret-free reason when not configured (cut to 200 characters). */
    reason?: string;
};
