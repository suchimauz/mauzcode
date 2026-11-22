/** Short-lived search-only authority. Neither an ordinary connection nor a caller-selected account. */
export type NativeWebSearchConnection = Readonly<{
    id: string;
    /** Read the bound key or attested login tuple. Only valid inside this operation. */
    credentials(): Promise<{ values: Readonly<Record<string, string>>; proof: types.models.NativeWebSearchProof }>;
    /** Dispatch through the saved transport after rechecking the exact tuple returned by credentials(). */
    request(url: string, init: { method: 'POST'; headers?: RequestInit['headers']; body: string }): Promise<Response>;
}>;
