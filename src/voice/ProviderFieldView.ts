/**
 * One configuration field of a voice provider as shown in a settings form.
 *
 * The projection flattens the provider's field schema so a form does not have to understand the schema union.
 * A secret field never carries a default: a default would be rendered and stored as ordinary configuration.
 */
export type ProviderFieldView = {
    /** Stable configuration key, unique within the provider. */
    key: string;
    /** Human-readable field name. */
    label: string;
    /** Field kind; `secret` fields are stored in the secret store and never returned. */
    type: "text" | "url" | "select" | "secret" | "number" | "boolean";
    /** Whether a value must be supplied before the connection can be saved. */
    required?: boolean;
    /** Safe explanatory text; never includes credentials. */
    help?: string;
    /** Safe example displayed when the field is empty. */
    placeholder?: string;
    /** Default value for a non-secret field; absent for secret fields. */
    default?: string | number | boolean;
    /** Allowed values of a `select` field. */
    options?: { value: string; label: string }[];
};
