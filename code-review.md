# Plan Review: UI Improvements
**Date:** 2026-03-18
**Plan:** `docs/plans/2026-03-18-ui-improvements.md`
**Reviewer:** Claude Sonnet 4.6

---

## Summary

The plan is well-structured and architecturally sound. The core decisions — two-disclosure sidebar, `useT()` hook reading from Zustand, `ignoreDuplicates: true` on the login upsert, upsert-not-delete for flashcard seeds — are all correct. There are two bugs in the test update instructions (Task 2) that will cause failures if followed literally, one task-ordering hazard between Tasks 6 and 7, and a handful of minor items. No blockers on the implementation architecture itself.

---

## Issues

### Critical

**1. Task 2 Step 6: test mock targets the wrong method**

The plan instructs:
```typescript
vi.mocked(supabase.select).mockResolvedValueOnce({
  data: { display_name: 'Test User', language: 'nl' },
  error: null,
})
```

This is wrong. The mock chain is `schema → from → select → eq → maybeSingle`, and `select` is mocked to return `this` (the mock object itself). Calling `mockResolvedValueOnce` on `select` has no effect — the resolved value comes from `maybeSingle`.

**Fix:** Replace with:
```typescript
vi.mocked((supabase as any).maybeSingle).mockResolvedValueOnce({
  data: { display_name: 'Test User', language: 'nl' },
  error: null,
})
```

**2. Task 2 Step 6: `initialize()` now makes two `.maybeSingle()` calls but the test only queues one**

After Task 2, `initialize()` calls both `loadProfileData` (→ `.maybeSingle()`) and `checkAdmin` (→ `.maybeSingle()`) in parallel via `Promise.all`. The `beforeEach` sets a single default return `{ data: null }`. Adding one `mockResolvedValueOnce` for the profile query means the second `.maybeSingle()` call (admin check) falls through to the default. This works by accident today but is fragile — a future `beforeEach` change will silently break the test.

**Fix:** Explicitly queue both calls in order:
```typescript
// First maybeSingle: loadProfileData (Promise.all resolves left-to-right)
vi.mocked((supabase as any).maybeSingle).mockResolvedValueOnce({
  data: { display_name: 'Test User', language: 'nl' },
  error: null,
})
// Second maybeSingle: checkAdmin
vi.mocked((supabase as any).maybeSingle).mockResolvedValueOnce({ data: null })
```

---

### Important

**3. Tasks 6 and 7 both do a major rewrite of `Layout.tsx` with a commit between them**

Task 6 adds `useMantineColorScheme`, `toggleColorScheme`, `colorScheme`, `ActionIcon`, `IconSun`, and `IconMoon` to `Layout.tsx` and commits. Task 7 then rewrites the entire header from scratch. The Task 7 code snippet does include all of Task 6's additions, so the final result is correct — but this is an easy place for an implementer to start Task 7 from the pre-Task-6 file state and accidentally drop the color scheme toggle.

**Fix:** Add an explicit note at the start of Task 7: *"Task 7 replaces the entire header. The code snippets in this task already include the dark/light toggle from Task 6 — do not re-apply Task 6 changes separately after completing Task 7."*

**4. Task 8: `card_sets` upsert relies on a unique constraint that isn't confirmed to exist**

The seed script uses:
```typescript
.upsert({ owner_id, name, ... }, { onConflict: 'owner_id,name' })
```

This requires `UNIQUE(owner_id, name)` on `indonesian.card_sets`. Task 8 adds a UNIQUE constraint for `anki_cards` in Step 0, but there is no equivalent step for `card_sets`. If the constraint is absent, Postgres silently inserts duplicates on re-seeding rather than updating.

**Fix:** Verify this constraint exists in `migrate.ts`. If not, add a Step 0a:
```sql
ALTER TABLE indonesian.card_sets
  ADD CONSTRAINT IF NOT EXISTS card_sets_owner_name_key UNIQUE (owner_id, name);
```

---

### Minor

**5. The test stub in Task 2 Step 6 uses a misleading chain form**

```typescript
vi.mocked(supabase.schema('indonesian').from('profiles').upsert).mockResolvedValue({ error: null })
```

In the flat mock, `schema().from().upsert` all resolve to the same mock object (`this`), so this is equivalent to `vi.mocked(supabase.upsert).mockResolvedValue(...)`. The chained form implies table-specific targeting, which is not how the mock works.

**Fix:** Use the flat form: `vi.mocked(supabase.upsert).mockResolvedValue({ error: null })` with a comment that the mock applies globally regardless of table.

**6. Task 7 includes a no-op instruction: "Remove the `useMediaQuery` import"**

The current `Layout.tsx` does not import `useMediaQuery`. This instruction can be safely ignored.

**7. Login/Register pages will always show Dutch for unauthenticated users**

`useT()` defaults to `'nl'` when `profile` is null. An English-preferring user who logs out will see Dutch on the login page. The plan acknowledges this for Login (Task 4 Step 2) but does not acknowledge it for Register. Given the app's audience this is acceptable — worth a one-line comment in Task 4 Step 3 to prevent a future contributor from adding unnecessary localStorage fallback.

**8. Task 4: removal of the Supabase Studio button doesn't say where admins go instead**

The plan removes the admin-only Studio button from Dashboard. The plan itself says "admins should bookmark https://db.supabase.duin.home directly" — this note should appear in the plan's Task 4 Step 1 so the implementer doesn't need to infer it.

---

## Strengths

- **`ignoreDuplicates: true` on the login upsert** — the current code overwrites `display_name` and `language` on every token refresh. The fix is correct and the explanation is thorough.
- **`maybeSingle()` over `single()`** in `loadProfileData` — correctly avoids `PGRST116` on zero rows; consistent with `Profile.tsx`'s existing query on the same table.
- **`Promise.all` for `loadProfileData` + `checkAdmin`** — parallel fetch is a clear improvement over the sequential approach in the current `initialize()`.
- **Flashcard upsert on `(card_set_id, front)`** — upsert-not-delete correctly preserves SM-2 `card_reviews` history. Step 0 front-loads the required constraint as a prerequisite.
- **`seed-flashcards` excluded from `seed-all`** — the reasoning (admin user prerequisite causes silent partial failure) is correct and documented.
- **Two-disclosure sidebar pattern** — `useDisclosure(true)` for desktop open by default, and the `if (mobileOpened) toggleMobile()` guard to prevent accidentally opening on desktop, are both correct Mantine v8 patterns.
- **`useT()` reading from Zustand** — reactivity is automatic: language change → store update → all `useT()` callers re-render. No context provider or prop drilling needed.
- **Avatar initials preserved in Task 7** — the plan explicitly calls this out with a comment ("Intentionally keep initials from current code, not `<IconUser>`"). Good.
- **`en: typeof nl` typing** — enforces structural equality between language objects at compile time, including the function-valued `lessonCompleteMessage` key.
- **Scope note in Task 4** — explicitly documenting that Flashcards/Leaderboard/Podcasts are out of scope for this translation pass is better than leaving it ambiguous.

---

## Task-by-Task Notes

| Task | Status | Notes |
|------|--------|-------|
| 1 | Ready | `ADD COLUMN IF NOT EXISTS` is idempotent and safe on a live DB. |
| 2 | Fix first | Apply Critical #1 and #2 before the test step. |
| 3 | Ready | Hook is minimal and correct. Brief Dutch flash on login is acceptable. |
| 4 | Ready | Welcome string null-guard is correct. Studio button note should be explicit. |
| 5 | Ready | `SegmentedControl` API is correct Mantine v8. `useT()` should be called before any early returns. |
| 6 | Ready | `localStorageColorSchemeManager` + `defaultColorScheme` together is correct Mantine v8. |
| 7 | Note dependency | See Important #3. Add the task-ordering callout before implementing. |
| 8 | Verify constraint | See Important #4. Confirm `UNIQUE(owner_id, name)` exists on `card_sets`. |
| 9 | Ready | Checklist covers all 8 tasks. "Language persists after logout/login" is the key integration test for Task 2's `ignoreDuplicates` fix. |

---

## Verdict

**Ready to implement after two small fixes.** Resolve Critical #1 and #2 (both in Task 2 Step 6's test instructions) before starting. Verify the `card_sets` unique constraint before Task 8. The task-ordering note for Tasks 6/7 can be added to the plan or handled by awareness during implementation.
