/** Bind each catalogue tail row to its workspace without changing historical messages. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE messages ADD COLUMN IF NOT EXISTS skill_scope TEXT' });
    },
};
