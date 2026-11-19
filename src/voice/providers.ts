/**
 * List registered voice providers as a secret-free metadata catalogue
 *
 * Use this catalogue to build provider pickers and configuration forms. It carries only declared metadata: the
 * audio destination, the supported connection transports (`["direct"]` when undeclared), the connection field schema
 * and the statically declared transcription models. It never
 * returns handlers, ownership internals, connection values or secret defaults.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): types.voice.ProviderView[] {
    const field = (spec: types.voice.FieldSpec): types.voice.ProviderFieldView => {
        const base = {
            key: spec.key,
            label: spec.label,
            ...(spec.required !== undefined ? { required: spec.required } : {}),
            ...(spec.help !== undefined ? { help: spec.help } : {}),
            ...(spec.placeholder !== undefined ? { placeholder: spec.placeholder } : {}),
        };
        switch (spec.type) {
            case "secret": return { ...base, type: "secret" };
            case "select": return { ...base, type: "select", ...(spec.default !== undefined ? { default: spec.default } : {}), options: spec.options.map(option => ({ value: option.value, label: option.label })) };
            case "number": return { ...base, type: "number", ...(spec.default !== undefined ? { default: spec.default } : {}) };
            case "boolean": return { ...base, type: "boolean", ...(spec.default !== undefined ? { default: spec.default } : {}) };
            default: return { ...base, type: spec.type, ...(spec.default !== undefined ? { default: spec.default } : {}) };
        }
    };
    return Object.values(ctx.state.voice?.providers ?? {})
        .map(({ definition: def }) => ({
            id: def.id,
            label: def.label,
            ...(def.description !== undefined ? { description: def.description } : {}),
            destination: def.destination,
            transports: Array.isArray(def.transports) && def.transports.length ? [...def.transports] : ["direct" as const],
            fields: def.fields.map(field),
            models: [...(def.models ?? [])],
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
}
