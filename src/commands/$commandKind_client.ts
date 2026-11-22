/** A closed set of declarative client operations; deliberately no server dispatch. */
export default {
    validate(command) {
        const action = command.clientAction;
        if (action === 'attach-file' || action === 'open-goal') return;
        if (action && typeof action === 'object' && action.type === 'open-canvas' && typeof action.kind === 'string' && action.kind.trim() && action.args && typeof action.args === 'object' && !Array.isArray(action.args)) return;
        throw new Error('Unsupported clientAction');
    },
    describe(command) { return { clientAction: command.clientAction }; },
} satisfies types.commands.KindHandler;
