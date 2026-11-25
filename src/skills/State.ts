// ctx.state.skills — process-local secrets of the skills reader.
export type State = {
    /** Random per-process key that signs read_skill continuations; absent until the first continuation. A restart invalidates old continuations. */
    continuationKey?: Buffer;
};
