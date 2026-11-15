/** Writable preset fields; storage owns builtin and updated_at. */
export type Definition = {
    /** Unique kebab-case identifier. */
    id: string;
    /** Nonempty display name. */
    name: string;
    /** Human-readable purpose. @default "" */
    description?: string;
    /** Menu order, lowest first. @default 0 */
    sort_order?: number;
    /** Core function globs. @default [] */
    allow?: string[];
    /** Function globs denied regardless of origin. @default [] */
    deny?: string[];
    /** Plugin identifiers or star for every plugin. @default [] */
    plugins?: string[];
    /** Prompt section identifiers to omit. @default [] */
    exclude_sections?: string[];
    /** Additional system instructions. @default "" */
    prompt?: string;
};
