/** A staged, reviewable skill package bound to its owning agent, workspace, destination and content digest. */
export type Draft = {
    /** Random draft identifier. */
    id: string;
    /** Owning Creator agent; only its review can publish the draft. */
    agentId: string;
    /** Workspace identity of the owning agent when the draft was prepared. */
    workspace: { host: string; dir: string };
    /** Destination scope. */
    destination: 'workspace' | 'serverProject' | 'serverGlobal';
    /** Canonical ID the package will have after publication. */
    skillId: string;
    /** Package directory name, equal to the manifest name. */
    name: string;
    /** sha256 over paths, executable bits and bytes of all files. */
    digest: string;
    /** Human-readable description of where the files came from. */
    source: string;
    /** Exact files to publish. */
    files: types.skills.StagedFile[];
    /** Original text of adapted files, for the review diff. */
    originals: Record<string, string>;
    /** Epoch milliseconds after which the draft can no longer be reviewed. */
    expiresAt: number;
};
