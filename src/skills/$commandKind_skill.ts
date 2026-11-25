/** Agent Skills invoked as /skill.<origin>:<name>. Entries are derived from visible packages by commands.candidates, never declared statically. */
export default {
    validate() {
        throw new Error('skill commands are derived from skill packages and cannot be declared');
    },
    describe(command) {
        return { skill: command.skill };
    },
    async dispatch(ctx, _session, opts) {
        return ctx.fns.skills.dispatch(opts);
    },
} satisfies types.commands.KindHandler;
