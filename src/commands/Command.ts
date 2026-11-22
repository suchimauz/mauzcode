/** Trusted declaration; the loader supplies the canonical full name. */
export type Command = {
    name?: string;
    kind: string;
    label: string;
    description: string;
    builtin?: boolean;
    icon?: string;
    section?: string;
    order?: number;
    inputHint?: string;
    usage?: string[];
    attachments?: boolean;
    args?: {placeholder?: string; options?: {value: string; label?: string; description?: string}[]};
    clientAction?: 'attach-file' | 'open-goal' | {type: 'open-canvas'; kind: string; args: Record<string, unknown>};
    requiresSession?: boolean;
    blockWhileRunning?: boolean;
    available?: string;
    fn?: string;
    template?: string;
    /** Custom kind-specific static data. */
    [field: string]: unknown;
};
