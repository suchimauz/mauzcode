/** Trusted dispatch context passed to a registered action after its durable claim. */
export type ActionInput = {
    /** Target session. */ agentId: string;
    /** Validated declaration with its fully qualified name. */ command: types.commands.Command;
    /** Entire submitted slash command, preserved for display. */ text: string;
    /** Parsed argument text, never instructions from the system. */ args: string;
    /** Stable client submission key. */ requestId: string;
    /** Server-generated identity used when finishing a running operation. */ operationId: string;
};
