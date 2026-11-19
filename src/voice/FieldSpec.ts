/**
 * Configuration schema for a voice connection, consumed by connection validation and schema-driven forms.
 *
 * The shape follows the Models SDK field types (text, url, select, secret, number, boolean) but is declared by
 * the voice module: the Voice SDK has no dependency on `types.models`. A secret field may never declare a
 * default, because defaults are rendered and stored as ordinary configuration.
 */
export type FieldSpec = {
    /** Stable configuration key, unique within the provider. */
    key: string;
    /** Human-readable field name. */
    label: string;
    /** Whether a value must be supplied before saving a connection. */
    required?: boolean;
    /** Safe explanatory text; never include credentials. */
    help?: string;
    /** Safe example displayed when the field is empty. */
    placeholder?: string;
} & (
    | { type: "text" | "url"; default?: string }
    | { type: "select"; default?: string; options: { value: string; label: string }[] }
    | { type: "secret"; default?: never }
    | { type: "number"; default?: number }
    | { type: "boolean"; default?: boolean }
);
