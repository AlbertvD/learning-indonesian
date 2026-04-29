# New App Hard Cutover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the new lesson reader and capability session model the only supported app path, with incomplete content failing closed instead of falling back to legacy lesson/practice behavior.

**Architecture:** The cutover should remove learner-facing legacy paths while keeping deeper legacy data modules only where other pages still depend on them. Lesson visibility/readiness must be derived from `lesson_page_blocks`, source progress, and capability summaries. Sessions must use the capability planner/player path, and old routes must disappear rather than silently scheduling global legacy material.

**Tech Stack:** React, TypeScript, Vite, Vitest, React Testing Library, Supabase JS.

---

### Task 1: Flip Capability Migration Defaults

**Files:**
- Modify: `src/lib/featureFlags.ts`
- Test: `src/__tests__/featureFlags.test.ts`

**Step 1: Write failing tests**

Add tests proving these flags default enabled when env vars are missing or empty:
- `capabilityMigrationFlags.standardSession`
- `capabilityMigrationFlags.experiencePlayerV1`
- `capabilityMigrationFlags.lessonReaderV2`

Keep `localContentPreview` disabled by default because it is a dev-only tool.

**Step 2: Verify red**

Run:

```powershell
$env:VITE_SUPABASE_URL='http://localhost:54321'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; npm run test -- src/__tests__/featureFlags.test.ts
```

Expected: tests fail because the three migration flags currently default false.

**Step 3: Implement**

Add an enabled-by-default parser for the cutover flags, or make those specific flags use the existing enabled-by-default parser. Preserve explicit `false` / `0` as a rollback switch.

**Step 4: Verify green**

Run the same focused test. Expected: pass.

**Step 5: Commit**

```powershell
git add src/lib/featureFlags.ts src/__tests__/featureFlags.test.ts
git commit -m "Default to new learning runtime"
git push
```

---

### Task 2: Remove the Standalone Legacy Practice Route

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/pages/Practice.tsx`
- Modify: `src/pages/admin/PageLab.tsx`
- Test: create or update app routing/PageLab tests if existing coverage requires it

**Step 1: Search usages**

Run:

```powershell
Get-ChildItem -Path src -Recurse -File | Select-String -Pattern '/practice|Practice.tsx|<Practice'
```

Expected: only route import/use and PageLab admin links remain.

**Step 2: Write failing test if route coverage exists**

If route tests exist, update them to expect `/practice` to hit the normal not-found/protected behavior rather than rendering `Practice`.

**Step 3: Implement**

Remove the `Practice` import and `/practice` route from `App.tsx`. Delete `Practice.tsx`. Remove PageLab links that point to `/practice?mode=weak`; replace with `/session` only if the admin page still needs a working preview link.

**Step 4: Verify**

Run relevant route/PageLab tests, then:

```powershell
$env:VITE_SUPABASE_URL='http://localhost:54321'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; npm run build
```

**Step 5: Commit**

```powershell
git add src/App.tsx src/pages/admin/PageLab.tsx src/pages/Practice.tsx
git commit -m "Remove legacy practice route"
git push
```

---

### Task 3: Make Lessons Overview Show Only New-Prepared Lessons as Available

**Files:**
- Modify: `src/pages/Lessons.tsx`
- Test: `src/__tests__/Lessons.test.tsx`

**Step 1: Write failing tests**

Add tests proving:
- a lesson with no `lesson_page_blocks` is shown as unavailable or coming later, not as open/practice-ready;
- the recommended lesson ignores lessons without page blocks;
- the overview still renders prepared lessons normally.

**Step 2: Verify red**

Run:

```powershell
$env:VITE_SUPABASE_URL='http://localhost:54321'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; npm run test -- src/__tests__/Lessons.test.tsx
```

Expected: fail because current overview defaults every published lesson to openable.

**Step 3: Implement**

After fetching page blocks, mark lessons with zero page blocks as not prepared. Filter them out of the recommendation model or render a disabled row with learner-facing “Coming later” copy. Keep the all-lessons page compact: title, status, action, grammar tag only.

**Step 4: Verify green**

Run the focused test and `npm run build`.

**Step 5: Commit**

```powershell
git add src/pages/Lessons.tsx src/__tests__/Lessons.test.tsx
git commit -m "Gate lessons on prepared page blocks"
git push
```

---

### Task 4: Remove Lesson Page Legacy Fallback

**Files:**
- Modify: `src/pages/Lesson.tsx`
- Test: `src/__tests__/Lesson.test.tsx`

**Step 1: Write failing tests**

Add tests proving:
- when a lesson has no `lesson_page_blocks`, the lesson page shows a learner-friendly unavailable state;
- the old tabbed lesson UI is not rendered;
- `progressService.markLessonComplete` is not called from the new lesson page.

**Step 2: Verify red**

Run:

```powershell
$env:VITE_SUPABASE_URL='http://localhost:54321'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; npm run test -- src/__tests__/Lesson.test.tsx
```

Expected: fail because the current component still contains and can render the legacy branch when the flag is off or page blocks are absent.

**Step 3: Implement**

Remove the old branch from `Lesson.tsx` or isolate it behind no reachable condition. The route should render `LessonReader` only when page blocks exist, otherwise a clear “Deze les wordt voorbereid” state with a link back to lessons. Remove lesson-page calls to `progressService.markLessonComplete`.

**Step 4: Verify green**

Run focused lesson tests and build.

**Step 5: Commit**

```powershell
git add src/pages/Lesson.tsx src/__tests__/Lesson.test.tsx
git commit -m "Fail closed for unprepared lessons"
git push
```

---

### Task 5: Verify Cutover Safety

**Files:**
- Modify docs only if verification reveals missing operational notes.

**Step 1: Full test**

Run:

```powershell
$env:VITE_SUPABASE_URL='http://localhost:54321'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; npm run test
```

Expected: all tests pass.

**Step 2: Build**

Run:

```powershell
$env:VITE_SUPABASE_URL='http://localhost:54321'; $env:VITE_SUPABASE_ANON_KEY='test-anon-key'; npm run build
```

Expected: build passes. Existing Vite/chunk warnings are acceptable if unchanged.

**Step 3: Diff hygiene**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors.

**Step 4: Fresh review**

Ask a fresh context to review whether any learner-facing legacy route or unsafe fallback remains.

**Step 5: Final commit if needed**

Commit any docs/test hardening found during review and push.
