/** Creation-time preset identity and rules, independent of later preset edits. */
export type Snapshot = {
    presetId: string;
    name: string;
    layers: types.agentPreset.Layer[];
};
