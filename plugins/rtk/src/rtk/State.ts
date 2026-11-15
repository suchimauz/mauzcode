/** Process-local RTK lifecycle state; reset by plugin start/stop and never persisted. */
export type State = {
    /** Plugin lifecycle generation: bumped on start and stop so in-flight enables of a previous lifecycle cannot commit. */
    generation?: number;
    /** Control revision whose enabled state was verified by a successful probe in this process (restart clears it). */
    verifiedRevision?: number;
    /** Serialises state-changing operations (check/enable/revalidate) inside this process. */
    queue?: Promise<unknown>;
};
