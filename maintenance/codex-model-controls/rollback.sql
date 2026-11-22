-- Run against an explicitly selected, OFFLINE, backed-up database with psql -X -v ON_ERROR_STOP=1.
-- No provider calls, no credentials, no transcript edits. Fail closed before any persistent change.
BEGIN;
LOCK TABLE agents, messages, llm_connections IN SHARE ROW EXCLUSIVE MODE NOWAIT;
CREATE TEMP TABLE codex_rollback_generations ON COMMIT DROP AS
 SELECT a.id, g, a.parent_id, a.fork_offset,
   COALESCE(a.sleep_context->'generations' IS NULL, false) AS legacy
 FROM agents a CROSS JOIN LATERAL jsonb_array_elements(CASE
   WHEN a.sleep_context IS NULL THEN '[]'::jsonb
   WHEN a.sleep_context ? 'generations' THEN a.sleep_context->'generations'
   ELSE jsonb_build_array(a.sleep_context) END) g
 WHERE EXISTS (SELECT FROM jsonb_array_elements(COALESCE(g->'contextMessages','[]')) m WHERE m->>'message_type'='codex_compaction')
 OR EXISTS (SELECT FROM messages m WHERE m.agent_id=g->>'contextAgentId' AND m.message_type='codex_compaction');
-- Verify canonical plain text history digests; block complex rows requiring SDK decoding.
CREATE OR REPLACE FUNCTION pg_temp.codex_source_ok(chat text, frontier bigint, digest text) RETURNS boolean
LANGUAGE SQL STABLE AS $$
 WITH source AS (SELECT *,row_number() OVER (ORDER BY idx)-1 AS pos FROM messages
   WHERE agent_id=chat AND COALESCE(excluded_from_llm,0)=0 ORDER BY idx LIMIT frontier),
 encoded AS (SELECT idx,pos,tool_calls IS NULL AND tool_call_id IS NULL AND result_ref IS NULL
   AND COALESCE(excluded_from_cursor,0)=0 AND author IS NULL AND COALESCE(message_type,'message')='message'
   AND (content IS NULL OR left(content,1)<>'[') AS simple,
   '{'||CASE WHEN content IS NULL THEN '' ELSE '"content":'||to_json(content)::text||',' END||
   '"idx":'||idx::text||',"role":'||to_json(role)::text||'}'||chr(10) AS line FROM source)
 SELECT count(*)=frontier AND CASE WHEN digest IS NULL THEN bool_and(idx=pos) ELSE bool_and(simple) AND
 encode(sha256(convert_to(string_agg(line,'' ORDER BY idx),'UTF8')),'hex')=digest END FROM encoded
$$;
CREATE TEMP TABLE codex_rollback_blocked ON COMMIT DROP AS
 -- Old readers can also see native checkpoints in canonical (including forked) history.
 SELECT DISTINCT agent_id AS id FROM messages WHERE message_type='codex_compaction' AND COALESCE(excluded_from_llm,0)=0
 UNION SELECT DISTINCT id FROM codex_rollback_generations r WHERE
   -- Do not guess about inherited, foreign, missing or malformed frontiers.
   (parent_id IS NOT NULL AND fork_offset IS DISTINCT FROM 0) OR (g->>'sourceAgentId' IS NOT NULL AND g->>'sourceAgentId'<>id)
   OR EXISTS (SELECT FROM messages WHERE agent_id=r.id AND COALESCE(excluded_from_llm,0)=0 AND message_type='anthropic_compaction')
   OR NOT COALESCE(CASE WHEN COALESCE(g->>'sourceOffset',g->>'sourceFrontier') ~ '^[1-9][0-9]{0,14}$'
      AND COALESCE(g->>'tailStart',g->>'sourceOffset',g->>'sourceFrontier') ~ '^[0-9]{1,15}$'
      THEN COALESCE(g->>'sourceOffset',g->>'sourceFrontier')::bigint > 0 AND pg_temp.codex_source_ok(r.id,COALESCE(g->>'sourceOffset',g->>'sourceFrontier')::bigint,g->>'sourceDigest')
       AND COALESCE(g->>'tailStart',g->>'sourceOffset',g->>'sourceFrontier')::bigint <= COALESCE(g->>'sourceOffset',g->>'sourceFrontier')::bigint END,false);
DO $$ DECLARE blocked text; BEGIN
 SELECT string_agg(id, ', ' ORDER BY id) INTO blocked FROM codex_rollback_blocked;
 IF blocked IS NOT NULL THEN RAISE EXCEPTION 'Rollback blocked; restore compatible history for these chat IDs before starting old readers: %', blocked; END IF;
END $$;
-- Ineligible generations cannot be reactivated after downgrade. Preserve portable generations;
-- if a selected generation was removed, return that session to full history.
UPDATE agents a SET sleep_context = CASE WHEN r.legacy THEN NULL ELSE
 a.sleep_context || jsonb_build_object('generations', COALESCE((SELECT jsonb_agg(g ORDER BY ord) FROM jsonb_array_elements(a.sleep_context->'generations') WITH ORDINALITY AS each(g,ord) WHERE NOT(g=ANY(r.bad))), '[]'::jsonb)) ||
 CASE WHEN a.sleep_context->>'activeRevision'=ANY(r.revs) THEN '{"mode":"full","activeRevision":null}'::jsonb ELSE '{}'::jsonb END ||
 CASE WHEN a.sleep_context->>'draftRevision'=ANY(r.revs) THEN '{"draftRevision":null,"draftOwner":null}'::jsonb ELSE '{}'::jsonb END END
FROM (SELECT id,bool_or(legacy) AS legacy,array_agg(g) AS bad,array_agg(g->>'revision') AS revs FROM codex_rollback_generations GROUP BY id) r WHERE a.id=r.id;
UPDATE agents SET reasoning_effort='auto' WHERE reasoning_effort='max';
UPDATE llm_connections SET models_cache=NULL, models_cached_at=NULL, models_cache_generation=NULL
WHERE provider='codex' AND (models_cache_generation IS NOT NULL OR EXISTS (
 SELECT FROM jsonb_array_elements(models_cache) m WHERE m ? 'responseControls' OR m ? 'reasoningUnavailable' OR m->'reasoning'->'supported' ? 'max'));
COMMIT;
