/** One frozen rule set in a snapshot; every layer must permit a direct call. */
export type Layer = {
    id: string;
    allow: string[];
    deny: string[];
    plugins: string[];
    excludeSections: string[];
    prompt: string;
};
