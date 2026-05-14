-- Rollback for 2026-05-14-retirement-8-orphan-tables.sql.
--
-- IMPORTANT: this rollback is best-effort and incomplete.
--
-- The seven dropped tables (anki_cards, card_reviews, card_set_shares,
-- card_sets, user_progress, user_vocabulary, vocabulary) had no canonical
-- schema definition in version control — no CREATE TABLE in
-- scripts/migration.sql, no entry in scripts/migrations/*.sql, no commit in
-- git history with the original DDL. They were created out-of-band (likely
-- via Supabase Studio in the project's earliest days) and never tracked.
--
-- Restoring the exact original column definitions is therefore not possible
-- from this repository alone. If the live DB has a backup that predates the
-- retirement #8 deploy, the tables can be restored from there.
--
-- This file is kept for audit-trail consistency with other retirement
-- rollbacks. Running it does NOT recreate the tables; running it is a no-op
-- transaction that documents the limitation.
--
-- If a future feature genuinely needs flashcard sets or per-user vocabulary
-- tracking, design it fresh — with RLS, proper grants, and an entry in
-- scripts/migration.sql — rather than trying to reverse-engineer the
-- abandoned originals.

begin;
-- intentionally no-op
commit;
