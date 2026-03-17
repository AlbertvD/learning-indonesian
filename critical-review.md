# Critical Review — Indonesian Learning App

**Reviewed:** 2026-03-17 (fourth pass — all issues resolved in fifth pass)
**Documents reviewed:** design doc, implementation plan (Tasks 1–13), CLAUDE.md

Prior review cycles resolved all previously identified issues. This pass reviews the current state of both documents from scratch and identifies remaining gaps.

**Fifth pass (2026-03-17):** All 9 issues from this review have been applied to the implementation plan:
- #1 `seed-podcasts.ts` metadata insert — ✅ fixed
- #2 `seed-lessons.ts` section seeding — ✅ fixed
- #3 `getDueCards` return type — ✅ fixed (DueCard type added to src/types/cards.ts, return type corrected)
- #4 `UserProgress` type missing — ✅ fixed (src/types/progress.ts added to Task 7)
- #5 `user_roles` SELECT policy — ✅ fixed
- #6 service key validation — ✅ fixed (seed-vocabulary.ts added; migrate.ts documented as SQL-only, no key needed)
- #7 storage bucket sequencing — ✅ fixed (moved before Task 12)
- #8 `profiles.created_at` — ✅ fixed
- #9 `anki_cards.owner_id` redundancy — ✅ documented

---

## What's Well-Designed

The following are genuinely correct and worth keeping:

- Cookie-based auth scoped to `.duin.home` — SSO foundation is sound
- Conditional `cookieOptions` in dev — avoids silent cookie rejection on localhost
- `@supabase/ssr` for frontend, plain `@supabase/supabase-js` for scripts — right tool for each context
- SM-2 kept client-side — pure math, no backend needed
- `card_reviews` separate from `anki_cards` — shared sets work correctly
- `custom_key` generated column in `user_vocabulary` — NULL uniqueness handled properly
- `duration_seconds` as a generated column — no drift between stored and computed values
- Leaderboard view anchored on `profiles` not `auth.users` — correct for PostgREST
- Explicit per-table `GRANT` statements — no `GRANT ALL`
- `onConflict: 'module_id,order_index'` for lesson seed upserts — no duplicate rows on re-runs
- `ignoreDuplicates: true` on profiles upsert now has a comment explaining the deliberate trade-off
- Privacy exposure on user progress tables now has a comment justifying the decision
- `setTimeout(0)` on post-sign-in fetches — deadlock avoidance is documented
- Test infrastructure now in Task 1 before Task 2b — correct ordering
- CI/CD workflow now in Task 13 Step 5 — deployment is covered
- "Longest Streak" tab removed from Leaderboard description — matches the view's columns
- `.order('order_index', { referencedTable: 'lesson_sections' })` — sections ordered correctly
- `AUDIO_DIR ?? 'content/podcasts'` default — no crash on bare `make seed-podcasts` invocation

---

## Bugs That Will Break at Runtime

### 1. `seed-podcasts.ts` uploads audio but never inserts podcast metadata

```typescript
// Task 12, seed-podcasts.ts (as written)
for (const file of readdirSync(audioDir)) {
  if (!file.endsWith('.mp3')) continue
  const buffer = readFileSync(`${audioDir}/${file}`)
  const storagePath = `podcasts/${file}`

  const { error: uploadError } = await supabase.storage
    .from('indonesian-podcasts')
    .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true })
  // ...
}
// Script ends here — no insert into indonesian.podcasts
```

The script uploads `.mp3` files to storage but never inserts rows into the `podcasts` table. After running `make seed-podcasts`, the storage bucket has audio but `podcasts` is empty. The Podcasts page will show nothing.

The plan mentions a `scripts/data/podcasts.ts` data file (referenced in the Task 12 source-table mapping) but the seed script shown ignores it. The script needs to import from `scripts/data/podcasts.ts` and upsert into `indonesian.podcasts` after uploading audio.

---

### 2. `seed-lessons.ts` never seeds `lesson_sections`

```typescript
// Task 12, seed-lessons.ts (as written)
const { data, error } = await supabase
  .schema('indonesian')
  .from('lessons')
  .upsert(lesson, { onConflict: 'module_id,order_index' })
  .select('id')
  .single()
if (error) { console.error('Failed:', lesson.title, error.message); continue }
console.log('Upserted:', lesson.title, data.id)
// ^ data.id is obtained and then ignored
```

The lesson ID is retrieved after upsert but never used. `lesson_sections` (a separate table with a FK to `lessons.id`) is never inserted. After seeding, the `lessons` table has rows but `lesson_sections` is empty — all lesson content is missing. The Lesson page will render lesson headers with no sections.

The seed script needs to iterate over the lesson's sections and upsert them to `indonesian.lesson_sections` using `data.id` as the `lesson_id`.

---

### 3. `getDueCards` return type is a lie

```typescript
// Task 5, cardService.ts
async getDueCards(userId: string): Promise<AnkiCard[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('card_reviews')
    .select('*, anki_cards!inner(*, card_sets!inner(*))')
    .eq('user_id', userId)
    .lte('next_review_at', new Date().toISOString())
    .order('next_review_at')
```

The query selects from `card_reviews` with nested `anki_cards`. The actual shape returned is:

```typescript
Array<CardReview & { anki_cards: AnkiCard & { card_sets: CardSet } }>
```

But the declared return type is `AnkiCard[]`. Any code that treats the result as `AnkiCard[]` and accesses `.front` directly (instead of `.anki_cards.front`) will get `undefined` at runtime with no TypeScript error.

**Fix:** Define an accurate return type or restructure the query so `getDueCards` returns `AnkiCard[]` with SM-2 state embedded (e.g. select from `anki_cards` joined to `card_reviews`).

---

## TypeScript Compile Errors

### 4. `UserProgress` type not imported in `progressService.ts`

```typescript
// Task 7, progressService.ts
async upsertProgress(userId: string, updates: Partial<Omit<UserProgress, 'id' | 'user_id' | 'created_at'>>) {
```

`UserProgress` is referenced but never imported — the type is not defined in the shown snippet and there is no corresponding types file for it (the plan creates `src/types/cards.ts` and `src/types/auth.ts` but no `src/types/progress.ts`). TypeScript will fail to compile this file.

**Fix:** Add `src/types/progress.ts` with a `UserProgress` interface matching the `user_progress` table schema, and import it in `progressService.ts`.

---

## Security / RLS Gap

### 5. `user_roles` has RLS enabled but no SELECT policy — admin checks always return false

```sql
-- From Task 2 migration:
ALTER TABLE indonesian.user_roles ENABLE ROW LEVEL SECURITY;
-- ...no policy for user_roles is defined anywhere in the migration
-- ...no GRANT SELECT on user_roles for authenticated
```

With RLS enabled and no policy, authenticated users have zero access to `user_roles`. Two things break:

**a. `checkAdmin()` in `authStore.ts` always returns false:**

```typescript
const { data } = await supabase
  .schema('indonesian')
  .from('user_roles')
  .select('role')
  .eq('user_id', userId)
  .eq('role', 'admin')
  .maybeSingle()
return !!data  // always false — RLS blocks the read
```

`profile.isAdmin` will always be `false`. Any UI admin gates will never open.

**b. Admin write RLS policies can never fire:**

```sql
CREATE POLICY "lessons_admin_write" ON indonesian.lessons FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
```

The subquery `SELECT 1 FROM indonesian.user_roles ...` runs under the calling user's permissions. With no SELECT policy on `user_roles`, the subquery returns empty for everyone — so the `EXISTS` check is always false. No authenticated user can write lessons/vocabulary/podcasts from the frontend.

This is harmless today because all content is managed via scripts (which use the service role and bypass RLS). But if any admin frontend UI is added later, it will silently fail.

**Fix:** Add a self-read policy to `user_roles`:

```sql
CREATE POLICY "user_roles_read" ON indonesian.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON indonesian.user_roles TO authenticated;
```

Users can only see their own role — enough for `checkAdmin()` and RLS subqueries. No one sees other users' roles.

---

## Infrastructure Gaps

### 6. `SUPABASE_SERVICE_KEY` missing validation in all scripts

```typescript
// Task 12, seed-lessons.ts (and seed-vocabulary.ts, seed-podcasts.ts)
const supabase = createClient(
  'https://api.supabase.duin.home',
  process.env.SUPABASE_SERVICE_KEY!  // non-null assertion
)
```

If `SUPABASE_SERVICE_KEY` is not set (e.g. `make seed-lessons` without the key argument), `createClient` receives `undefined` as the key. It doesn't throw — it silently creates a client equivalent to the anon role. The script then fails with an RLS error (`"permission denied"`) that gives no indication the service key was missing.

**Fix:** Validate at startup:

```typescript
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY is required. Run: make seed-lessons SUPABASE_SERVICE_KEY=<key>')
  process.exit(1)
}
const supabase = createClient('https://api.supabase.duin.home', serviceKey)
```

Apply this pattern in all three seed scripts and in `migrate.ts`.

---

### 7. Storage bucket creation is sequenced after seed scripts in the plan

The "Storage Bucket Setup (one-time, manual)" section appears at the end of the implementation plan — after Task 13 (Docker deployment). But `seed-podcasts.ts` (Task 12) uploads to those buckets. If someone follows the plan in order, they'll hit Task 12 before ever creating the buckets, and every upload will fail with a `"Bucket not found"` error.

**Fix:** Move the storage bucket setup into Task 2 (alongside the schema migration) or make it an explicit prerequisite for Task 12. It should appear before the first task that writes to storage.

---

## Minor Issues

### 8. `profiles` table has no `created_at` column

Every other table in the schema has `created_at timestamptz DEFAULT now()` except `profiles` (which has only `id`, `display_name`, `updated_at`). Inconsistent and makes it impossible to query "users who signed up in the last 30 days" if that becomes useful.

Not a bug, but trivially fixable in the migration.

---

### 9. `anki_cards.owner_id` is redundant

`anki_cards` has both `card_set_id` (FK to `card_sets`) and `owner_id`. The card's owner is already derivable from `card_sets.owner_id`. Both fields must be kept in sync — if a card set is transferred (not a current feature but possible), `anki_cards.owner_id` would become stale.

The RLS write policy uses `owner_id = auth.uid()`, which works, but it means card creation requires passing `owner_id` explicitly on the client side. If the app ever adds card set transfer, `owner_id` on cards will silently drift.

Low risk for a homelab app, but worth noting.

---

## Priority Order

1. **#5** (`user_roles` SELECT policy) — add to migration before running it; without this `checkAdmin()` always returns false and admin RLS policies never fire
2. **#2** (`seed-lessons.ts` missing sections) — fix before Task 12 or lesson content is empty
3. **#1** (`seed-podcasts.ts` missing metadata insert) — fix before Task 12 or Podcasts page shows nothing
4. **#4** (`UserProgress` type missing) — fix before Task 7 or the app won't compile
5. **#3** (`getDueCards` return type) — fix before Task 5 or review page will have silent undefined accesses
6. **#7** (storage bucket sequencing) — move bucket creation before Task 12
7. **#6** (service key validation) — add to all scripts before first seed run
8. **#8 & #9** — low priority; add `created_at` to profiles if convenient, document `owner_id` redundancy
