type Origin = Readonly<{ agent: types.agent.Agent; route: string; runId: string; claim?: string; current: () => boolean }>;
type Decision = Readonly<{
    origin: Origin; provider: string; model: string; connectionId: string; accountName: string;
    transport: types.models.TransportSpec; registration?: types.models.NativeWebSearchOperation; proof: types.models.NativeWebSearchProof | null;
}>;

/** Process-local capabilities keyed by object identity, never serialized or accepted from tool arguments. */
export type NativeWebSearchState = {
    nativeSearchOrigins?: WeakMap<object, Origin>;
    nativeSearchReplies?: WeakMap<object, Decision>;
    nativeSearchDispatch?: WeakMap<object, Decision>;
    nativeSearchSteps?: WeakMap<object, { decision: Decision; signal: AbortSignal }>;
    nativeSearchInference?: WeakMap<types.models.ResolvedConnection, { request: object; view: types.models.ConnectionView }>;
    nativeSearchResolved?: WeakMap<types.models.ResolvedConnection, types.models.NativeWebSearchOperation>;
    nativeSearchQueries?: WeakSet<object>;
    nativeSearchCalls?: WeakSet<object>;
    nativeSearchConnections?: WeakSet<object>;
    nativeSearchReads?: WeakMap<types.models.NativeWebSearchProof, types.models.NativeWebSearchConnection>;
    nativeInferenceHandoff?: WeakMap<RequestInit, () => void>;
    nativeSearchHandoff?: WeakMap<RequestInit, (send: (body: string) => void) => Promise<void>>;
};
