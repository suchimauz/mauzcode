/** Single-row, instance-scoped RTK control record: owner intent, latest safe availability result and a monotonic revision. */
export default {
  up: async (ctx: Context): Promise<void> => {
    await ctx.fns.procs.db.exec({ sql: `
      CREATE TABLE IF NOT EXISTS rtk_control (
        id smallint PRIMARY KEY CHECK (id = 1),
        enabled boolean NOT NULL DEFAULT false,
        revision bigint NOT NULL DEFAULT 0,
        availability text NOT NULL DEFAULT 'unknown' CHECK (availability IN ('unknown', 'available', 'unavailable')),
        path text CHECK (octet_length(path) <= 4096),
        version text CHECK (octet_length(version) <= 200),
        reason text CHECK (octet_length(reason) <= 500),
        checked_at bigint,
        updated_at bigint NOT NULL DEFAULT 0
      );
      INSERT INTO rtk_control (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    ` });
  },
  down: async (ctx: Context): Promise<void> => {
    await ctx.fns.procs.db.exec({ sql: 'DROP TABLE IF EXISTS rtk_control' });
  },
};
