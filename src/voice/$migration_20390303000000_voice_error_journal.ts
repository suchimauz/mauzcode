/** Persist only sanitized, time-limited provider diagnostics. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `CREATE TABLE voice_error_journal (
            id TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f]{16}$'),
            created_at BIGINT NOT NULL,
            provider TEXT,
            model TEXT,
            stage TEXT NOT NULL CHECK (stage IN ('opening', 'streaming', 'finishing')),
            cause TEXT NOT NULL CHECK (cause IN ('authentication', 'rateLimit', 'timeout', 'unknown'))
        );
        CREATE INDEX voice_error_journal_recent ON voice_error_journal (created_at DESC, id DESC)` });
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: 'DROP TABLE voice_error_journal' });
    },
};
