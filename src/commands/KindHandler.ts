/** SDK for a trusted command kind. Reject an invalid declaration by throwing. */
export type KindHandler = {
    validate: (command: types.commands.Command, ctx: Context) => void | Promise<void>;
    describe: (command: types.commands.Command, ctx: Context) => Record<string, unknown>;
    dispatch?: types.commands.ActionHandler;
};
