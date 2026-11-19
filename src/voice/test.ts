/**
 * Test a voice connection through its provider
 *
 * Use for an explicit "Test" button or before relying on a connection. The provider's own check runs without
 * user audio. The result is fully local and fixed: one sentence per status and a reason from a closed set of
 * codes, never provider text; it never contains a secret value or a `secret://` reference. The check is cut off
 * at `timeoutMs`, even for a provider that ignores the abort signal.
 * @param opts.id Connection UUID.
 * @param opts.timeoutMs Deadline for the provider check. @default 20000 @minimum 100 @maximum 120000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Deadline for the provider check. @default 20000 @minimum 100 @maximum 120000 */
        timeoutMs?: number;
    },
): Promise<types.voice.TestResult> {
    return ctx.fns.voice.connections.test(opts);
}
