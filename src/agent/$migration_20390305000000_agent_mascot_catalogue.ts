/** Replace the simple mascots with the activity-animated catalogue; chats with a removed pet get a random new one once. */
export default {
    async up(ctx: Context) {
        const choices = "ARRAY['crab', 'deepy', 'whalegirl', 'dundun', 'tabby', 'shiba', 'maneki', 'daruma', 'tuerye', 'calico', 'cloudling', 'clawd', 'claude']";
        const random = `(${choices})[1 + floor(random() * 13)::int]`;
        // One transaction: no window without a constraint. Repeating it updates no rows and restores the same rules.
        await ctx.fns.procs.db.transaction({ fn: async () => {
            await ctx.fns.procs.db.exec({ sql: 'ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_mascot_check' });
            // random() is volatile, so each reassigned row draws its own pet.
            await ctx.fns.procs.db.exec({ sql: `UPDATE agents SET mascot = ${random} WHERE mascot <> ALL (${choices})` });
            await ctx.fns.procs.db.exec({ sql: `ALTER TABLE agents
                ADD CONSTRAINT agents_mascot_check CHECK (mascot = ANY (${choices})),
                ALTER COLUMN mascot SET DEFAULT ${random}` });
        } });
    },
};
