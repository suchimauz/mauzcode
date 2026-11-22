/** Optional Models capability, independent of the ordinary websearch engine registry. */
export type NativeWebSearchOperation = {
    binding: { kind: 'key'; field: string } | {
        kind: 'login';
        /** Secret-free, local read under the SDK's connection row lock. No network or nested transaction. */
        current(ctx: Context, connectionId: string): Promise<types.models.NativeWebSearchProof | null>;
        /** Read only the already-verified tuple under that lock; a directly invoked helper must not return credentials. */
        read(ctx: Context, conn: types.models.NativeWebSearchConnection, proof: types.models.NativeWebSearchProof): Promise<Record<string, string>>;
    };
    search(ctx: Context, conn: types.models.NativeWebSearchConnection, req: {
        model: string; query: string; limit: number; signal: AbortSignal; deadline: number;
    }): Promise<{ results: types.models.NativeWebSearchSource[] }>;
};
