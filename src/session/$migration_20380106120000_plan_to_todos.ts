/**
 * Boot-only move of the legacy todo state keys in agents.scratchpad: `plan` → `todos` and
 * `planHistory` → `todoHistory`, for every agent including archived ones.
 *
 * Each key moves separately and only when present and the target is absent; the old key is removed only
 * after it was moved, and no null keys are created. A row whose target already exists keeps both keys for
 * manual review and is counted as a conflict. Malformed JSON and non-objects are skipped and counted.
 * Refuses to run once agents are loaded: `session.save` writes the whole in-memory scratchpad and would
 * bring the legacy key back. `down` swaps the keys back under the same rule.
 */
const move = (from: string, to: string, fromHistory: string, toHistory: string) => `
DO $todos$
DECLARE
    row_data RECORD;
    value JSONB;
    next_value JSONB;
    changed_count BIGINT := 0;
    conflict_count BIGINT := 0;
    malformed_count BIGINT := 0;
    non_object_count BIGINT := 0;
BEGIN
    FOR row_data IN SELECT id, scratchpad FROM agents FOR UPDATE LOOP
        BEGIN
            value := row_data.scratchpad::jsonb;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR untranslatable_character THEN
            malformed_count := malformed_count + 1;
            CONTINUE;
        END;
        IF value IS NULL OR jsonb_typeof(value) <> 'object' THEN
            non_object_count := non_object_count + 1;
            CONTINUE;
        END IF;
        next_value := value;
        IF jsonb_exists(next_value, '${from}') THEN
            IF jsonb_exists(next_value, '${to}') THEN
                conflict_count := conflict_count + 1;
            ELSE
                next_value := jsonb_set(next_value - '${from}', '{${to}}', value -> '${from}');
            END IF;
        END IF;
        IF jsonb_exists(next_value, '${fromHistory}') THEN
            IF jsonb_exists(next_value, '${toHistory}') THEN
                conflict_count := conflict_count + 1;
            ELSE
                next_value := jsonb_set(next_value - '${fromHistory}', '{${toHistory}}', value -> '${fromHistory}');
            END IF;
        END IF;
        IF next_value IS DISTINCT FROM value THEN
            UPDATE agents SET scratchpad = next_value::text WHERE id = row_data.id;
            changed_count := changed_count + 1;
        END IF;
    END LOOP;
    RAISE NOTICE '${from} -> ${to} scratchpad move: changed=%, conflicts=%, malformed=%, non_object=%',
        changed_count, conflict_count, malformed_count, non_object_count;
END
$todos$;
`;

function assertBoot(ctx: Context) {
    const started = ctx.state.procs?.lifecycle?.started ?? [];
    if (started.includes("agent") || started.includes("procs/http")
        || Object.keys(ctx.state.agent ?? {}).length > 0
        || (ctx.state as { workerLoopPromise?: Promise<unknown> }).workerLoopPromise) {
        throw new Error("Todo scratchpad migration is boot-only: stop all writers and run before agent loading");
    }
}

export default {
    async up(ctx: Context) {
        assertBoot(ctx);
        // One DO statement is one atomic transaction with no JS JSON round-trip
        // (which would lose large integers) and no '?' JSON operators/placeholders.
        await ctx.fns.procs.db.exec({ sql: move("plan", "todos", "planHistory", "todoHistory") });
    },
    async down(ctx: Context) {
        assertBoot(ctx);
        await ctx.fns.procs.db.exec({ sql: move("todos", "plan", "todoHistory", "planHistory") });
    },
};
