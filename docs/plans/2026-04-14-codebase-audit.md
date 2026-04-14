# Codebase Audit — 2026-04-14

Comprehensive review of the learning-indonesian codebase across 12 dimensions.
Build: clean (0 TS errors). Tests: 333 passing, 38 suites. Bundle: 942 kB (over Vite's 500 kB warning).

---

## 1. Dead Code & Unused Files

### Orphan CSS modules (no importing component exists)
| File | Lines | Notes |
|---|---|---|
| `src/pages/Set.module.css` | 239 | Card sets feature was removed; pages deleted, CSS left behind |
| `src/pages/Sets.module.css` | 181 | Same |
| `src/pages/Review.module.css` | 287 | Old flashcard review page; removed, CSS left behind |

**Total:** 707 lines of dead CSS. Safe to delete.

### Orphan assets
- `src/assets/react.svg` — Vite scaffold leftover; never imported
- `src/assets/vite.svg` — same

### Unused source file: `src/lib/highlightPrefixes.tsx`
This file is never imported. Its logic is **duplicated** in `src/components/IndoText.tsx` (same prefix list, same algorithm). Additionally, `highlightPrefixes.tsx` uses the legacy `--purple` CSS variable while `IndoText.tsx` correctly uses `--accent-primary`. Delete `highlightPrefixes.tsx`.

### Unused component: `src/components/exercises/ExerciseFeedback.tsx`
Imported only by itself (self-reference in the file). No other component uses it — `ExerciseShell.tsx` implements its own inline feedback UI. This is ~107 lines of dead code. Either delete it or consolidate the inline feedback in ExerciseShell to use it (see Simplification #4).

### Unused exports in `src/domain/learning/exerciseCatalog.ts`
Only imported by its own test file (`exerciseCatalog.test.ts`). None of the app code uses `getExerciseMetadata`, `isImplemented`, `getImplementedExercises`, `getAllExercises`, `getExercisesByFocus`, `getGrammarAwareExercises`, `getApprovedContentExercises`, or `getPrimarySkillFacet`. This entire module (169 lines) is dead code in the runtime — it's a catalog that was built for a planned feature registry that never materialized. The exercise types live in `src/types/learning.ts` and `src/lib/featureFlags.ts` instead.

### Unused feature flag functions
`isContentPipelineEnabled()`, `isTextbookImportEnabled()`, `isAiGenerationEnabled()` in `featureFlags.ts` are never called by any app code (only referenced in docs). The `textbookImport` and `aiGeneration` flags are also never read. Consider removing these dead functions and their flags.

### Stale types in `src/types/contentGeneration.ts`
`TextbookSource`, `TextbookPage`, `ContentReviewItem`, `GeneratedExerciseCandidate` are only used in their own test file (`contentGenerationTypes.test.ts`) and nowhere in actual app code. The `ExerciseVariant` re-export from `learning.ts` is used, but the other types are dead. These types describe a content review pipeline that was replaced by the staging file approach.

### Claude Code hooks in `src/hooks/`
`src/hooks/pre-tool-use.ts`, `src/hooks/post-tool-use.ts`, `src/hooks/stop.ts`, `src/hooks/.platform-version`, and `src/lib/hook-utils.ts` are Claude Code plugin hooks — they run in the Claude Code environment, not in the app. They're in `src/` alongside app code, which is misleading. They should either be moved out of `src/` or gitignored if auto-generated.

---

## 2. Stale / Redundant Code

### i18n: large dead `sets`, `share`, `review` sections
The `sets`, `share`, and `review` sections in both `nl` and `en` in `src/lib/i18n.ts` (~160 lines total) contain translations for the removed card sets/flashcard features. No component references these keys. Remove them.

### Card set types in `src/types/learning.ts`
`learning.ts` still declares these in the module-level Data Model comment but the actual types are gone. The CLAUDE.md "Sharing Model (Card Sets)" section also documents a feature that no longer exists in code.

### `dailyRecommendationService.ts` — unreferenced by app code
Only imported by its test and by `goalServiceAPI.test.ts`. The dashboard and session page use `goalService.computeTodayPlan()` directly instead. This service (114 lines) is dead code — it computes the same targets that `computeTodayPlan` already handles. It appears to have been the original prototype that was superseded.

### `goalJobService.ts` — only reachable via test
This service (402 lines) handles scheduled jobs (weekly finalization, rollup snapshots, integrity repair). It's well-tested but is only imported by its test file. There's no cron trigger, no admin page, and no API endpoint that calls it. The comment says "designed to be called by pg_cron" but it runs in the browser bundle (imports `supabase` from `@/lib/supabase`). If the intent is server-side scheduling, this should be a separate script in `scripts/`, not in `src/services/`. As-is, it's dead code in the production bundle.

### Duplicate prefix lists
`IndoText.tsx` and `highlightPrefixes.tsx` both define `INDONESIAN_PREFIXES` with slightly different lists (`IndoText` has `peng`, `pem`, `pen` that `highlightPrefixes` does not). Delete `highlightPrefixes.tsx`.

---

## 3. Outdated Comments

### `sessionPolicies.ts:19,33` — "Phase 2+" comments
```typescript
// 2. Approved content check (deferred — Phase 2+)
// shaped = filterByApprovedContent(shaped, context)
```
The content pipeline shipped. All content is now published through `publish-approved-content.ts`. These "Phase 2+" comments and the commented-out code should be removed or updated.

### `fsrs.ts:55` — "No Easy rating at launch"
```typescript
/** Map exercise outcome to FSRS rating. No Easy rating at launch — only Again/Hard/Good. */
```
The app launched months ago. This is no longer "at launch" — it's a design decision. Reword to "Only Again/Hard/Good ratings" or remove the comment.

### Legacy CSS variable aliases in `main.tsx:161-177, 231-246`
The comment says "do not use in new code" but these `--bg`, `--surf-*`, `--text-1/2/3`, `--purple*`, `--sans`, `--display` aliases are still actively used by 8 CSS modules (see finding in section 5). Either:
- (a) Migrate the CSS modules to the new variable names and delete the aliases, or
- (b) Accept these as permanent and remove the "do not use" comments

### `exerciseCatalog.ts:35,61` — "Already implemented" / "New text-based exercises"
These comments describe rollout phases that are complete. All listed exercise types are implemented.

---

## 4. Simplification Opportunities

### S1: Inline feedback in `ExerciseShell.tsx` (95 lines)
`ExerciseShell.tsx` contains a large inline feedback UI (lines ~290-413) that duplicates the purpose of `ExerciseFeedback.tsx`. Either:
- Use `ExerciseFeedback` and extend it for grammar, or
- Delete `ExerciseFeedback.tsx` and keep the inline version (simpler)

Given that `ExerciseFeedback` is unused, option (b) is the path of least change.

### S2: Inconsistent i18n access pattern
Some components use `useT()` hook (pages), others import `translations` directly and index by `userLanguage` prop (exercise components). This is two patterns for the same thing. Exercise components receive `userLanguage` as a prop because they're rendered inside `ExerciseShell`, which already has access to `useT()`. Consider having `ExerciseShell` pass a `t` object to exercise components instead of a raw language string, eliminating the `import { translations }` calls in 13 exercise components.

### S3: Repetitive Supabase chunking pattern
`learningItemService.ts` repeats the same chunking pattern 6 times:
```typescript
const CHUNK_SIZE = 50
const results = []
for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
  const chunk = ids.slice(i, i + CHUNK_SIZE)
  const { data, error } = await supabase...
  results.push(...data)
}
```
`grammarStateService.ts` does the same 2 times. Extract a generic `chunkedQuery` helper.

### S4: `authStore.ts` update methods are copy-paste
`updateDisplayName`, `updateLanguage`, `updatePreferredSessionSize`, `updateTimezone` share the exact same structure: get user, update profile field, check for error, set state. A generic `updateProfileField(field, value, stateMapper)` would eliminate ~60 lines of duplication.

### S5: Bundle size (942 kB)
The build warns about chunks >500 kB. The i18n module alone is large. Consider:
- Dynamic imports for admin pages (`ContentReview`, `SectionCoverage`, `ExerciseCoverage`)
- Lazy-load the `Progress` page (it fetches 6 parallel API calls on mount)
- Consider route-based code splitting via `React.lazy()`

---

## 5. Consistency Issues

### CSS variable usage: legacy vs. new
8 CSS module files still use legacy aliases (`--surf-1`, `--text-1`, `--bg`, etc.) that `main.tsx` explicitly marks as "do not use in new code." This creates a split personality: some files use `--bg-surface`, others `--surf-1` for the same color. Migration target:

| Legacy | New |
|---|---|
| `--bg` | `--bg-main` |
| `--surf-1` | `--bg-surface` |
| `--surf-2`, `--surf-3` | `--bg-hover` |
| `--surf-4` | `--border-light` |
| `--text-1` | `--text-primary` |
| `--text-2` | `--text-secondary` |
| `--text-3` | `--text-tertiary` |
| `--purple*` | `--accent-primary*` |

### `--purple` in `highlightPrefixes.tsx`
Uses `var(--purple)` which maps to cyan, not purple. This was a brand rename that left confusing names behind. The new code in `IndoText.tsx` correctly uses `var(--accent-primary)`.

### Hardcoded Dutch strings in admin components
`FlagButton.tsx` has hardcoded Dutch text ("Markeer voor review", "Opslaan", "Annuleer", etc.) instead of using the i18n system. Since it's admin-only, this may be intentional — but it breaks if an English-language admin uses the app.

### Login/Register pages are not localized
`Login.tsx` and `Register.tsx` have hardcoded English text. Since these are the entry point, users see English regardless of their language preference.

---

## 6. Security

### No critical vulnerabilities in app code
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, or `Function()` usage
- No SQL injection risk (all queries go through Supabase JS client which parameterizes)
- No XSS vectors found — React's JSX escaping covers all user-visible text
- Auth properly gates all routes via `ProtectedRoute`
- Secrets (anon key, service key) are environment variables, not in code

### Dev bypass in ProtectedRoute
```typescript
const devBypass = import.meta.env.DEV && new URL(window.location.href).searchParams.get('bypassAuth') === '1'
```
This is safe because `import.meta.env.DEV` is `false` in production builds — Vite tree-shakes it out. Verified: the condition cannot be true in the production bundle.

### Dependency vulnerabilities (15 total via `bun audit`)
All are transitive (not direct):
- **lodash** (high) via `vite-plugin-pwa > workbox-build` — code injection via `_.template`. Not exploitable since the app doesn't call `_.template` with user input.
- **picomatch** (high) — ReDoS. Only runs at build time, not at runtime.
- **flatted** (high) — prototype pollution. Build-time only (vitest).
- **brace-expansion** (moderate) — DoS. Build-time only.
- **vite** (unknown severity) — check if 8.0.5+ is available.

**Action:** Run `bun update` to pick up patched versions. None of these are runtime-exploitable.

### `@anthropic-ai/sdk` is a production dependency
Listed in `dependencies` but never imported by any `src/` file. It's used by `scripts/` only (catalog-lesson-sections, etc.). Move it to `devDependencies` — it shouldn't be in the production bundle (even though Vite tree-shakes unused imports, the presence in `dependencies` is semantically wrong and adds to `bun install` time).

### `postgres` is a production dependency
Same issue — `postgres` (direct Postgres client) is used by `scripts/migrate.ts` only. Move to `devDependencies`.

### No rate limiting on auth endpoints
The Login and Register pages submit directly to Supabase GoTrue. GoTrue has its own rate limiting, but there's no client-side debouncing or attempt limiting. For a family app on a homelab this is fine, but worth noting.

### `logError` calls `supabase.auth.getUser()` on every error
This makes an auth request on every error log. If the error was caused by auth being down, this creates a cascade. The function handles it with try/catch, which is correct, but it could use cached auth state from `useAuthStore.getState().user?.id` instead of making a network call.

---

## 7. Scalability

### Current load: fine
This is a family-scale app (single-digit users). All observations below are for awareness, not urgency.

### `getStudyDaysCount` fetches all review events for a week
`goalService.getStudyDaysCount()` selects all `review_events` rows for a week and counts unique dates client-side. For an active learner doing 20 reviews/day * 7 days = 140 rows, this is fine. At 100+ daily reviews or many users, consider a server-side `DISTINCT DATE()` aggregate.

### `learnerStateService.getSkillStatesBatch` fetches all skill states
Instead of filtering by item IDs, it fetches ALL skill states for a user. Currently justified by the comment about URL length limits. At thousands of items this would transfer more data than needed.

### `goalJobService.runDailyRollupSnapshot` does N+1 queries per user
For each user, it runs ~6 separate Supabase queries. With N users this is 6N queries. At family scale this is instant; at 100+ users it would need server-side aggregation.

### Session queue builds the full dataset client-side
`Session.tsx` fetches ALL learning items, ALL meanings, ALL contexts, ALL variants, ALL skill states in parallel, then builds the queue in JS. This is the right approach for small datasets (<1000 items) but would need server-side filtering at scale.

### Single JS bundle at 942 kB
Vite warns about this. Code splitting via lazy routes would help. The i18n file and Dashboard are the largest contributors.

---

## 8. Test Coverage

### Well-tested areas
- FSRS logic, stage transitions, session queue building, answer normalization
- Service mocking patterns are consistent
- 333 tests across 38 suites, all passing

### Coverage gaps
- **Pages with complex UI logic:** `Dashboard.tsx` is 700+ lines with 4 ring charts, goal computations, hero card logic — only basic rendering is tested
- **Session flow:** `Session.tsx` (the most critical user-facing page) has no dedicated test for the end-to-end session flow (load → exercise → answer → next → summary)
- **Error paths:** Most tests verify happy paths. `logError` fallback behavior, session cleanup on incomplete sessions, and auth deadlock recovery are untested
- **Admin pages:** `ContentReview.tsx`, `SectionCoverage.tsx`, `ExerciseCoverage.tsx` have only one test file between them

### Test file that tests removed features
`src/__tests__/Progress.test.tsx` contains 475 lines and comments like "The current Progress.tsx does not yet implement the VulnerableItemsList" — suggesting the tests describe an aspired-to UI state rather than the actual implementation.

---

## 9. Type Safety

### `any` usage: 156 occurrences across 50 files
Most are in:
- Test files (mocking — acceptable)
- `goalService.ts:185` — `determineAdaptiveTargets(priorSet: any)` — could be typed
- `as any` casts for Supabase join results (`progressService.ts:89`, `learningItemService.ts:177`, `grammarStateService.ts:24`) — these are genuine limitations of supabase-js type inference on joins. Consider using generic type parameters or wrapper types.
- `Record<string, any>` in `payload_json` and `answer_key_json` fields — these are schemaless JSON columns; `any` is appropriate here

### Non-null assertions (`!`)
`user.email!` in `authStore.ts:200` — email can be null for phone-auth users, but since this app only supports email auth, this is safe. Still, a fallback would be safer.

---

## 10. Performance

### No unnecessary re-renders detected
- Zustand selectors are granular (`useAuthStore(s => s.user)`)
- Exercise components use `key` props correctly for reset
- Heavy computations (`buildSessionQueue`) are done once on session init, not in render

### Potential improvements
- `exerciseAvailabilityService` uses a 1-hour in-memory cache — good
- `goalService.computeTodayPlan` runs a full skill state query on every dashboard load — the result could be cached for the session duration
- `useProgressData` hook runs all wave-2 queries even if the user navigates away before they complete — no abort controller

---

## 11. Dependency Health

### Unused production dependencies
| Package | Used by | Should be |
|---|---|---|
| `@anthropic-ai/sdk` | `scripts/` only | `devDependencies` |
| `postgres` | `scripts/migrate.ts` only | `devDependencies` |
| `@mantine/form` | Nothing | Remove |
| `@mantine/modals` | Nothing | Remove |

### Unused dev dependency
| Package | Notes |
|---|---|
| `@vitejs/plugin-react` | Superseded by `@vitejs/plugin-react-swc`; vite even prints a recommendation message. Remove. |

### Missing dependency
| Package | Used by | Notes |
|---|---|---|
| `playwright-core` | `scripts/test-grammar-exercises.mjs` | Only used for e2e testing script; add to `devDependencies` if needed |

---

## 12. Architecture Notes

### Service layer is clean
One file per domain, consistent patterns, clear separation from UI. The `processReview` / `processGrammarReview` handlers in `reviewHandler.ts` correctly orchestrate multiple service calls in the right order.

### Good practices observed
- Error logging to Supabase is fire-and-forget (never blocks UI)
- Auth state management avoids common pitfalls (setTimeout for Supabase deadlock)
- Session cleanup handles incomplete sessions gracefully
- Feature flags with fail-open/fail-closed semantics are well-documented
- i18n coverage is comprehensive (NL and EN for all user-facing text, with noted exceptions)

### `src/domain/` directory is abandoned
Only contains `exerciseCatalog.ts` which is unused. The MEMORY.md references a plan to "consolidate src/lib/ business logic into src/domain/learning/" but this migration never happened. Either complete the migration or delete `src/domain/`.

---

## Summary: Priority Actions

### Quick wins (< 30 min each)
1. Delete orphan files: `Set.module.css`, `Sets.module.css`, `Review.module.css`, `highlightPrefixes.tsx`, `react.svg`, `vite.svg`
2. Delete unused `ExerciseFeedback.tsx`
3. Delete unused `src/domain/learning/exerciseCatalog.ts` (+ its test)
4. Remove dead i18n sections: `sets`, `share`, `review` (from both `nl` and `en`)
5. Move `@anthropic-ai/sdk` and `postgres` to `devDependencies`
6. Remove `@mantine/form`, `@mantine/modals`, `@vitejs/plugin-react`
7. Remove "Phase 2+" comments in `sessionPolicies.ts`
8. Run `bun update` to address dependency vulnerabilities

### Medium effort (1-2 hours each)
9. Migrate legacy CSS variables to new names in 8 CSS modules, then delete aliases
10. Extract `chunkedQuery` helper to reduce duplication in services
11. Add route-based code splitting (`React.lazy`) for admin and progress pages
12. Move `goalJobService.ts` and `dailyRecommendationService.ts` out of `src/services/` (either to `scripts/` or delete)
13. Move Claude Code hooks out of `src/hooks/` to a non-src location

### Larger efforts (half day+)
14. Consolidate i18n access: pass `t` object through ExerciseShell instead of language string
15. Add integration tests for Session flow (most critical user path)
16. Delete stale types from `contentGeneration.ts` and update its test
17. Refactor `authStore.ts` update methods into generic helper
