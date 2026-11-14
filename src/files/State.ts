// ctx.state.files — in-memory read receipts and the in-process write queue.
export type State = {
    /** Session key → readId → receipt; Map order is the LRU order. */
    receipts?: Map<string, Map<string, types.files.Receipt>>;
    /** Real path → tail of the in-process write chain for that file. */
    writeQueue?: Map<string, Promise<void>>;
};
