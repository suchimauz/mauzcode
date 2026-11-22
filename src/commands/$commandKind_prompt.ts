/** Expand only {{args}}; replacement text must never be interpreted as a replacement pattern. */
export default {
    validate(command) {
        if (typeof command.template !== 'string' || !command.template.trim()) throw new Error('Expected a nonempty prompt template');
    },
    describe() { return {}; },
    async dispatch(ctx, _session, opts) {
        const content = opts.command.template!.replaceAll('{{args}}', () => opts.args);
        return ctx.fns.commands.enqueue({ ...opts, content });
    },
} satisfies types.commands.KindHandler;
