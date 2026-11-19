/** Add the closed-set failure reason and a strictly shaped machine detail to voice diagnostics. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE voice_error_journal
            ADD COLUMN reason TEXT CHECK (reason IN ('socketClosed', 'socketError', 'serviceError', 'malformedMessage', 'sequenceMismatch', 'sendFailed', 'setupTimeout', 'finishTimeout', 'other')),
            ADD COLUMN detail TEXT CHECK (detail ~ '^([1-4][0-9]{3}|[a-z][a-z0-9_.]{0,63})$')` });
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE voice_error_journal DROP COLUMN detail, DROP COLUMN reason' });
    },
};
