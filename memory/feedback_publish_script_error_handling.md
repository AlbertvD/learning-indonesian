---
name: Publish script error handling
description: Every await supabase call in seeding/publish scripts must check the error return; upsert onConflict must reference a real unique constraint
type: feedback
---

Always check the error return on every `await supabase` call in publish/seed scripts.

**Why:** `publish-approved-content.ts` was missing `translation_language` (NOT NULL) on the `item_meanings` insert. The insert failed silently — no `if (error) throw error` — so the script reported success, items landed in `learning_items`, but `item_meanings` stayed empty. The bug only surfaced at runtime as "No exercises available for this session." — a completely different place from where the data was written.

**How to apply:** Pattern is mandatory in scripts: `const { error } = await supabase...; if (error) throw error`. Never leave a bare `await supabase...` with no error check in a seeding or publish script.

---

Also: `upsert(..., { onConflict: 'col1,col2' })` requires an actual `UNIQUE` index on those columns in the DB. If no such index exists, PostgREST silently treats it as a plain INSERT. Always verify the constraint exists in `migration.sql` before writing an upsert that depends on it. If no unique constraint exists, use delete-then-insert instead.
