/** Active declarations and their source records. Unknown kinds stay in sources, not registry. */
export type State = {
    /** Request owners in this process; absent after restart. */
    activeOperations?: Set<string>;
    registry?: Record<string, types.commands.Command & {name:string}>;
    kinds?: Record<string, types.commands.KindHandler>;
    sections?: Record<string, types.commands.Section>;
    sources?: Map<string, {family: string; rel: string; name: string; namespace: string; value: unknown; sections?: unknown}>;
    fileCache?: Map<string, {checked:number; fingerprint:string; commands:types.commands.Command[]}>;
};
