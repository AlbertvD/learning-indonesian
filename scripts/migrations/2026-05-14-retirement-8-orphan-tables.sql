-- Retirement #8 — orphan tables (2026-05-14).
-- Paper-trail rollout. The master scripts/migration.sql carries the same
-- drops and is what `make migrate` actually applies. This file exists for
-- operator audit and as a self-contained `psql -f` rollout if ever needed.
--
-- Drops 7 tables that exist in the live homelab DB but:
--   * Have zero rows (verified 2026-05-14 via service-role count(*))
--   * Have zero references in src/, scripts/, supabase/ (TS + SQL)
--   * Are not defined by any CREATE TABLE statement in scripts/migration.sql
--     or scripts/migrations/*.sql (git log -S "create table.*<name>" returns
--     no commits)
--   * Have no RLS enabled (would have been a real exposure risk if anything
--     wrote to them with user-scoped data)
--
-- These predate the rule that scripts/migration.sql is the authoritative
-- schema source (inversion of 2026-04-02). They were likely created via
-- Supabase Studio in the project's earliest days for features that never
-- shipped (legacy flashcard system, ad-hoc per-user progress tracking).
--
-- Target-architecture.md rule #10 ("Don't keep dead infrastructure on
-- speculation") makes the call: these go.

begin;

drop table if exists indonesian.anki_cards       cascade;
drop table if exists indonesian.card_reviews     cascade;
drop table if exists indonesian.card_set_shares  cascade;
drop table if exists indonesian.card_sets        cascade;
drop table if exists indonesian.user_progress    cascade;
drop table if exists indonesian.user_vocabulary  cascade;
drop table if exists indonesian.vocabulary       cascade;

commit;
