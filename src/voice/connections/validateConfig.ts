/**
 * Validate and normalize a voice connection against its provider field schema
 *
 * Use before storing a voice connection. Rejects an unknown provider, unknown keys, a secret field sent as
 * plain configuration, missing required fields, wrong value types, select values outside the declared options
 * and non-HTTP(S) or credential-bearing URLs, applies declared defaults and checks required secret fields
 * against the values that stay stored. Never stores, logs or returns secret values; errors carry
 * `code: "VALIDATION"` (or `UNKNOWN_PROVIDER`) and the offending `field`.
 * @param opts.provider Registered provider id.
 * @param opts.config Submitted non-secret configuration.
 * @param opts.secrets Submitted secret changes: string sets, null clears, an absent key keeps the stored value.
 * @param opts.stored Secret field keys that currently hold a stored value (update only).
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Registered provider id. */
        provider: string;
        /** Submitted non-secret configuration. */
        config?: Record<string, unknown>;
        /** Submitted secret changes: string sets, null clears, an absent key keeps the stored value. */
        secrets?: Record<string, unknown>;
        /** Secret field keys that currently hold a stored value (update only). */
        stored?: string[];
    },
): Promise<{ config: Record<string, types.voice.ConfigValue>; secrets: Record<string, string | null> }> {
    const fail = (message: string, field?: string, code = "VALIDATION"): never => { throw Object.assign(new Error(message), { code, status: 400, ...(field ? { field } : {}) }); };
    const entry = typeof opts.provider === "string" && Object.hasOwn(ctx.state.voice?.providers ?? {}, opts.provider) ? ctx.state.voice!.providers![opts.provider] : undefined;
    if (!entry) return fail(`Unknown voice provider: ${String(opts.provider).slice(0, 64)}`, undefined, "UNKNOWN_PROVIDER");
    const def = entry.definition;
    const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
    const input = opts.config ?? {};
    const secretInput = opts.secrets ?? {};
    if (!isRecord(input)) fail("Configuration must be an object");
    if (!isRecord(secretInput)) fail("Secrets must be an object");
    const fields = new Map(def.fields.map(field => [field.key, field]));
    const config: Record<string, types.voice.ConfigValue> = {};
    for (const key of Object.keys(input)) {
        const field = fields.get(key);
        if (!field) fail(`Unknown field: ${key.slice(0, 64)}`, key.slice(0, 64));
        if (field!.type === "secret") fail(`Secret field ${key} must be sent as a secret`, key);
    }
    for (const field of def.fields) {
        if (field.type === "secret") continue;
        let value = Object.hasOwn(input, field.key) ? input[field.key] : undefined;
        if (value === null || value === "") value = undefined;
        if (value === undefined && field.default !== undefined) value = field.default;
        if (value === undefined) {
            if (field.required) fail(`Missing required field: ${field.label}`, field.key);
            continue;
        }
        switch (field.type) {
            case "text":
                if (typeof value !== "string" || value.length > 4000) fail(`${field.label} must be text up to 4000 characters`, field.key);
                break;
            case "url": {
                if (typeof value !== "string" || value.length > 2048) fail(`${field.label} must be a URL`, field.key);
                let url: URL | undefined;
                try { url = new URL(value as string); } catch { fail(`${field.label} must be an absolute URL`, field.key); }
                if (!["http:", "https:"].includes(url!.protocol) || url!.username || url!.password) fail(`${field.label} must be a credential-free http(s) URL`, field.key);
                break;
            }
            case "select":
                if (typeof value !== "string" || !field.options.some(option => option.value === value)) fail(`${field.label} must be one of: ${field.options.map(option => option.value).join(", ")}`, field.key);
                break;
            case "number":
                if (typeof value !== "number" || !Number.isFinite(value)) fail(`${field.label} must be a finite number`, field.key);
                break;
            case "boolean":
                if (typeof value !== "boolean") fail(`${field.label} must be true or false`, field.key);
                break;
        }
        config[field.key] = value as types.voice.ConfigValue;
    }
    const secrets: Record<string, string | null> = {};
    const stored = new Set(opts.stored ?? []);
    for (const key of Object.keys(secretInput)) {
        const field = fields.get(key);
        if (!field || field.type !== "secret") fail(`Unknown secret field: ${key.slice(0, 64)}`, key.slice(0, 64));
        const value = secretInput[key];
        if (value === null) secrets[key] = null;
        else if (typeof value === "string" && value.length > 0 && value.length <= 16384) secrets[key] = value;
        else fail(`${field!.label} must be a nonempty secret up to 16384 characters, or null to clear`, key);
    }
    for (const field of def.fields) {
        if (field.type !== "secret" || !field.required) continue;
        const after = Object.hasOwn(secrets, field.key) ? secrets[field.key] !== null : stored.has(field.key);
        if (!after) fail(`Missing required field: ${field.label}`, field.key);
    }
    return { config, secrets };
}
