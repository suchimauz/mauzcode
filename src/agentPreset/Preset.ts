/** Persistent agent preset row; access rules are copied into snapshots at creation. */
export type Preset = {
    id: string;
    name: string;
    description: string;
    sort_order: number;
    builtin: boolean;
    allow: string[];
    deny: string[];
    plugins: string[];
    exclude_sections: string[];
    prompt: string;
    updated_at: number;
};
