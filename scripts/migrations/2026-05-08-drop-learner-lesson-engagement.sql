-- Drop indonesian.learner_lesson_engagement (orphan table).
--
-- The table was created out-of-band (likely via Supabase Studio) — its CREATE
-- TABLE never landed in scripts/migration.sql or any scripts/migrations/*.sql,
-- and zero references exist in src/, scripts/, or supabase/. It also surfaced
-- as one of the two stragglers in docs/known-regressions.md §1 (RLS-on with
-- zero policies). Cleanest resolution is to retire it rather than retrofit
-- policies onto an unused surface.
--
-- The master scripts/migration.sql carries the same drop and is what
-- `make migrate` actually applies. This file exists for operator audit and as
-- a self-contained psql -f rollout if ever needed (mirrors the 2026-05-07
-- drop-learner-grammar-state pattern).

begin;

drop table if exists indonesian.learner_lesson_engagement cascade;

commit;

-- PostgREST schema reload so the dropped table disappears from the API surface.
notify pgrst, 'reload schema';
