/** Qualified identity of one published package plus only the fields safe to publish. */
export type Descriptor = {
    /** Canonical qualified ID, e.g. skill.workspace:review or skill.plugin.git:review. */
    id: string;
    /** Upstream short name, identical to the manifest name. */
    name: string;
    /** Manifest description copied unchanged. */
    description: string;
    /** Origin family the package was discovered in. */
    sourceKind: 'workspace' | 'serverProject' | 'serverGlobal' | 'plugin';
    /** Default presentation label, e.g. Workspace, Server · global, or the plugin display name. */
    sourceLabel: string;
    /** Named workspace root or plugin identifier; absent for the unqualified forms. */
    qualifier?: string;
};
