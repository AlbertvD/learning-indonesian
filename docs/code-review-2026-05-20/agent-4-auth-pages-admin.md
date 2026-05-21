# Agent 4: Auth, routing, aux pages, admin

**Date:** 2026-05-20
**Files reviewed:** 26

## Files reviewed

- src/main.tsx
- src/App.tsx
- src/stores/authStore.ts
- src/components/ProtectedRoute.tsx (read for cross-context only)
- src/contexts/AutoplayContext.tsx
- src/contexts/ListeningContext.tsx
- src/contexts/SessionAudioContext.tsx
- src/hooks/useProgressData.ts
- src/hooks/useT.ts
- src/hooks/.platform-version
- src/pages/Login.tsx
- src/pages/Register.tsx
- src/pages/Profile.tsx
- src/pages/Leaderboard.tsx
- src/pages/Podcasts.tsx
- src/pages/Podcast.tsx
- src/pages/Session.tsx
- src/pages/Session.module.css
- src/pages/LocalPreview.tsx
- src/pages/ContentReview.tsx
- src/pages/ContentCoverage.module.css
- src/pages/ExerciseCoverage.tsx
- src/pages/SectionCoverage.tsx
- src/pages/admin/AdminGuard.tsx
- src/pages/admin/DesignLab.tsx
- src/pages/admin/PageLab.tsx
- src/components/admin/ExerciseSummaryCard.tsx

## Findings

### F4-1: `Profile.tsx` useEffect runs every language toggle, fights state
- **Severity:** cleanup
- **Category:** bug
- **Evidence:**
  - `src/pages/Profile.tsx:55-74` — `useEffect(() => { ... }, [user, profile, T])` resets `displayName`, `sessionSize`, and `timezone` to the values in `profile` every time `profile` changes (e.g. after the user edits the slider, after a language switch which updates `profile.language`, etc.).
  - `src/pages/Profile.tsx:120-140` — `handleSessionSizeChange` updates the store, the effect then re-fires and clobbers any local state typed mid-edit. Same shape for `handleTimezoneChange`.
- **Recommendation:** Initialise local state from `profile` once (or only when `user.id` changes), or drop the local mirror entirely and read straight from `profile` for display while keeping a local "draft" only for the displayName text input.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F4-2: `Profile` `useEffect` falsely advertises async — no awaited work, dead try/catch
- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/pages/Profile.tsx:55-74` — `async function fetchData()` only does synchronous `setX(profile?.…)` calls; the `try/catch` will never see an error, the notification path is unreachable, and the function does not need to be async.
- **Recommendation:** Inline the three setters into the effect body, drop the try/catch, drop `loading` (or set it from `!profile`).
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-3: `authStore.initialize` swallows the error from `getSession`/profile load
- **Severity:** cleanup
- **Category:** error-handling
- **Evidence:**
  - `src/stores/authStore.ts:50-52` — `} catch { set({ loading: false }) }` swallows every initialise failure with no `logError`, no notification. The user just sees the login page silently.
- **Recommendation:** `logError({ page: 'auth', action: 'initialize', error: err })` so we can debug "session restore returned nothing" scenarios.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-4: `authStore` post-sign-in profile load logs to console only, no `logError`
- **Severity:** cleanup
- **Category:** error-handling
- **Evidence:**
  - `src/stores/authStore.ts:79-82` — `catch (err) { console.error('[authStore] Failed to load profile after sign-in:', err); set({ user: session.user, profile: null }) }`. CLAUDE.md "Logging" section bans bare `console.error` as the only error handling.
- **Recommendation:** Replace with `logError({ page: 'auth', action: 'load-profile-post-signin', error: err })` (no user-facing notification — silent recovery is fine since `profile: null` still keeps the user signed in, but the failure must be queryable).
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-5: `Session.tsx` uses `console.error` instead of (or in addition to) `logError`
- **Severity:** cleanup
- **Category:** error-handling
- **Evidence:**
  - `src/pages/Session.tsx:140-142` — `console.error('Session init error:', err); logError({ page: 'session', action: 'initialize', error: err })`. `logError` is already called — the bare `console.error` is redundant and violates CLAUDE.md "Never `console.error` as the only error handling".
- **Recommendation:** Drop the `console.error`. The user already gets the friendly red-banner error from `setError`.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-6: `Session.tsx` leaks the raw error message into the user-facing alert
- **Severity:** cleanup
- **Category:** error-handling
- **Evidence:**
  - `src/pages/Session.tsx:138-142` — `const errMsg = err instanceof Error ? err.message : JSON.stringify(err); setError(\`Sessie laden mislukt: ${errMsg}\`)`. Raw `JSON.stringify(err)` or Supabase error strings get rendered to the user — directly contradicts CLAUDE.md "Never show raw error strings, Supabase error codes, or technical details to the user."
- **Recommendation:** `setError(T.session.failedToLoad)` (already exists or is trivial to add). Keep `logError` for debugging.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-7: `Podcast.tsx` empty-state message is hard-coded English, not localised
- **Severity:** cleanup
- **Category:** inconsistency
- **Evidence:**
  - `src/pages/Podcast.tsx:62-63` — `<EmptyState … message="Failed to load podcast." />`. Every other surface in this page uses `T.podcast.*`; this single string fell through.
- **Recommendation:** Add `T.podcast.failedToLoadEmpty` (NL "Podcast laden mislukt.") and use it here.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-8: `Login.tsx` `<a href="/register">` causes full page reload, kills auth state warm path
- **Severity:** cleanup
- **Category:** bug
- **Evidence:**
  - `src/pages/Login.tsx:62` — `<a href="/register">{T.login.createOne}</a>`
  - `src/pages/Register.tsx:76` — `<a href="/login">{T.register.logIn}</a>`
- **Recommendation:** Use `<Link to="/register">` from `react-router-dom`. Plain `<a>` triggers a hard refresh, the BrowserRouter remounts, `authStore.initialize` runs again. Tiny UX paper-cut, simple fix.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-9: Login/Register hard-code Dutch (`nl as T`) — ignores user language preference
- **Severity:** cleanup
- **Category:** inconsistency
- **Evidence:**
  - `src/pages/Login.tsx:8` — `import { nl as T } from '@/lib/i18n'`
  - `src/pages/Register.tsx:8` — `import { nl as T } from '@/lib/i18n'`
- **Recommendation:** If the project intentionally serves only NL on auth screens (a defensible choice since there's no user yet), add a code comment. Otherwise use `useT()` once we know the browser language. Right now this is silent half-finished work — every other page uses `useT()`.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-10: `hooks/useProgressData.ts` hard-codes English notification text
- **Severity:** cleanup
- **Category:** inconsistency
- **Evidence:**
  - `src/hooks/useProgressData.ts:124-125` — `title: 'Failed to load progress', message: 'Could not load your progress data. Please try again.'`. The page is bilingual everywhere else; this is the only EN-only string.
- **Recommendation:** Pull through `useT()` (or accept a `T` argument from the calling page).
- **Estimated effort:** trivial
- **Cross-slice dependency:** agent 3 (Progress.tsx) — they call this hook

### F4-11: `ContentReview.tsx` duplicates the admin-guard logic in-page instead of using `AdminGuard`
- **Severity:** cleanup
- **Category:** duplication
- **Evidence:**
  - `src/pages/ContentReview.tsx:32-34` — `useEffect(() => { if (profile && !profile.isAdmin) navigate('/', { replace: true }) }, [profile, navigate])` and `src/pages/ContentReview.tsx:173` — `if (!profile.isAdmin) return null`.
  - `src/pages/admin/AdminGuard.tsx:26-46` — the canonical admin gate.
  - `src/App.tsx:156-162` — `/admin/content-review` is wrapped only in `<ProtectedRoute>`, not in `<AdminGuard>`. Compare lines 163-178 where `/admin/design-lab` and `/admin/page-lab` rely on `<AdminGuard>` inside the page body.
- **Recommendation:** Either wrap the page body in `<AdminGuard>` and delete the in-page checks (matches DesignLab/PageLab), or wrap the route in App.tsx with `<AdminGuard>`. Pick one place; today three pages use three different patterns (route-level, body-level wrapper, in-page useEffect).
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-12: `/content/sections` and `/content/exercises` lack admin gating despite admin-only sidebar entry
- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** misplaced-logic
- **Evidence:**
  - `src/App.tsx:139-154` — both routes use `<ProtectedRoute>` only, no `<AdminGuard>`.
  - `src/components/Sidebar.tsx:40-41` — Sidebar links to `/content/sections` and `/content/exercises` always (no admin-only gating on those entries — only the explicit `/admin/content-review` link on `Sidebar.tsx:45` is admin-gated).
  - `src/pages/SectionCoverage.tsx:27-57` / `src/pages/ExerciseCoverage.tsx:31-147` — both pages hit several internal tables and would expose schema details to any authenticated user.
  - Although RLS likely blocks reads for non-admins, the pages will render empty tables / spinning loaders rather than redirecting.
- **Recommendation:** Wrap both routes in `<AdminGuard>` (or move them to `/admin/coverage/*`). The "ContentCoverage" file naming + admin sidebar grouping implies these are admin tools.
- **Estimated effort:** trivial
- **Cross-slice dependency:** agent 3 (Sidebar/nav)

### F4-13: `ContentReview.tsx` direct Supabase query bypasses lessonService
- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** direct-supabase-from-ui
- **Evidence:**
  - `src/pages/ContentReview.tsx:50` — `supabase.schema('indonesian').from('lessons').select('id, title, order_index').order('order_index')` inline in the page. Compare `lessonService.getLessonsBasic()` used elsewhere.
- **Recommendation:** Route through `lessonService.getLessonsBasic()` (or add a service method if shape differs). CLAUDE.md "Direct Supabase in pages" rule.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-14: `SectionCoverage.tsx` direct Supabase queries — no service layer
- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** direct-supabase-from-ui
- **Evidence:**
  - `src/pages/SectionCoverage.tsx:32-34` — two table reads inline (`lessons`, `lesson_sections`).
- **Recommendation:** Extract `coverageService.getSectionCoverage()` (mirrors the `fetchSections` helper). Page becomes presentational.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F4-15: `ExerciseCoverage.tsx` 6 direct Supabase queries — no service layer
- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** direct-supabase-from-ui
- **Evidence:**
  - `src/pages/ExerciseCoverage.tsx:40-49` — six parallel queries against `lessons`, `item_contexts`, `item_meanings`, `exercise_variants`, `item_context_grammar_patterns`, `grammar_patterns`. All in-page.
- **Recommendation:** Extract `coverageService.getExerciseCoverage()`. Per CLAUDE.md, pages should call services.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F4-16: `ContentReview.renderExercisePreview` uses `payload_json as Record<string, any>` + `as any` casts
- **Severity:** cleanup
- **Category:** type-hole
- **Evidence:**
  - `src/pages/ContentReview.tsx:142` — `const p = variant.payload_json as Record<string, any>`
  - `src/pages/ContentReview.tsx:145-151` — `onAnswer={(() => {}) as any}` repeated 4×.
- **Recommendation:** Type the no-op as `() => void` (matches `onAnswer` signature) or extract a `noopAnswer: ExerciseAnswerHandler = () => {}` constant. The `payload_json` cast is a wider problem — exercise components already accept their own typed `previewPayload`, so this can be `payload_json as ExercisePayload` per type.
- **Estimated effort:** small
- **Cross-slice dependency:** agent 6 (exercises)

### F4-17: `ExerciseSummaryCard.renderSummary` casts `payload_json as Record<string, any>`
- **Severity:** cleanup
- **Category:** type-hole
- **Evidence:**
  - `src/components/admin/ExerciseSummaryCard.tsx:16` — `const p = variant.payload_json as Record<string, any>`. Eight subsequent fields are unchecked (`p.base_text`, `p.promptMeaningText`, `p.targetSentenceWithBlank`…); a published variant whose payload shape silently drifts shows `—` everywhere instead of breaking the typecheck.
- **Recommendation:** Discriminate on `variant.exercise_type` first and cast `p` to the per-type payload shape from `@/types/learning`. Per-case typed narrowing kills the `Record<string, any>` exit.
- **Estimated effort:** small
- **Cross-slice dependency:** agent 6 (exercise payload types)

### F4-18: `Profile` `useEffect` depends on the whole `T` translation object
- **Severity:** cleanup
- **Category:** bug
- **Evidence:**
  - `src/pages/Profile.tsx:74` — `[user, profile, T]`. `T = useT()` returns a new top-level object every render of every component reading `language` (because `useT` returns `translations[lang]` — the reference is stable for a given lang, BUT each `useT` consumer subscribes to the auth store independently). Even so, switching language re-fires the effect and resets `displayName` / `sessionSize` mid-edit (compounds F4-1).
- **Recommendation:** Drop `T` from the dep array (the effect doesn't read `T` for any state-mutating purpose — the unreachable catch branch reads it, see F4-2). Use `eslint-disable` only if you keep the bogus catch.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-19: `Leaderboard.tsx` and `Podcasts.tsx` deps include the resolved string literals, not the `T` object
- **Severity:** cleanup
- **Category:** bug
- **Evidence:**
  - `src/pages/Leaderboard.tsx:39` — `[activeTab, T.common.error, T.leaderboard.failedToLoad]`
  - `src/pages/Podcasts.tsx:43` — `[T.common.error, T.common.somethingWentWrong]`
  - `src/pages/Podcast.tsx:44` — `[podcastId, user, T.common.error, T.podcast.failedToLoad]`
- **Recommendation:** This is a half-defensible pattern (the string is stable per language) but it (a) refetches when the user toggles language mid-page (probably unintended) and (b) makes the dep array brittle to T edits. Either drop them (the strings are only read inside the notification call which runs at error time, not render time) or extract a `useStableT` helper. Calling `notifications.show` inside the catch reads `T` lexically — no need for it in deps.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-20: `Session.tsx` redirect-to-login runs inside an effect that also depends on `lessonFilter`, `sessionMode`
- **Severity:** cleanup
- **Category:** bug
- **Evidence:**
  - `src/pages/Session.tsx:74-148` — `useEffect(...)` returns early with `navigate('/login')` when `!user`, but `didInit.current` is set *after* the user check. If the user signs out mid-session the effect re-fires (deps include `user`), `didInit.current` is already true from a previous run, and the effect now does nothing (no navigate). The `if (!user) { navigate('/login'); return }` runs before `didInit.current` is consulted, so the redirect does fire — but the design intent is unclear because the ref pattern conflicts with the user-change branch.
- **Recommendation:** Decouple: a separate `useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])` for the redirect, and a one-shot init effect for the session build. Today the two concerns are tangled.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F4-21: `Session.module.css` is dead — Session.tsx no longer references the CSS module
- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/pages/Session.module.css:3` — `/* skip-check: TODO Phase 5 — Session migrates to <PageContainer fit><PageBody variant="fit"> and this whole file is deleted */`
  - `src/pages/Session.tsx` (entire file) — no `import … from './Session.module.css'`. Already uses `PageContainer`/`PageBody`.
- **Recommendation:** Delete `src/pages/Session.module.css`. The migration the TODO predicted is already done.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-22: `src/hooks/.platform-version` is a stray non-code file with no purpose
- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `ls -la src/hooks/` shows `.platform-version` (8 bytes, content `b976edd`). No reference anywhere in the codebase to that filename.
- **Recommendation:** Remove. Looks like a tool artefact (Fly.io / similar) that was accidentally committed.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-23: `/lesson-preview/1` is a permanent-looking route to a single bespoke page; not reachable from any UI
- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/App.tsx:30` — `const Lesson1Bespoke = lazy(() => import('@/pages/lessons/lesson-1/Page'))`
  - `src/App.tsx:84-90` — route wired to `/lesson-preview/1`.
  - `grep -rn "/lesson-preview"` — only matches the route itself and the comment; zero callers.
- **Recommendation:** Either flip it into the canonical `/lesson/1` route (per the recent `chore/exercises-ui-cleanup` branch's bespoke-lesson direction) or remove the dangling route. Right now it's a hidden URL nobody can find.
- **Estimated effort:** trivial
- **Cross-slice dependency:** agent 3 (Lesson page wiring)

### F4-24: `ProtectedRoute` dev bypass mutates the auth store from inside a render effect
- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** misplaced-logic
- **Evidence:**
  - `src/components/ProtectedRoute.tsx:17-29` — `useEffect(() => { … useAuthStore.setState({ user: …, profile: …, loading: false } as any) }, [devBypass])`. Two `as any` casts inside the auth-store write.
- **Recommendation:** Lift dev-bypass into `authStore.initialize()` (read the URL once at boot, set the fake user, never touch from a guard component). Today the guard knows the schema of the store, which is a layering inversion. Also lets you drop both `as any` casts and the redundant `<AdminGuard>` dev-bypass at `src/pages/admin/AdminGuard.tsx:20-31`.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F4-25: `ProtectedRoute` hard-codes `auth.duin.home` SSO redirect — no env config, breaks staging
- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** misplaced-logic
- **Evidence:**
  - `src/components/ProtectedRoute.tsx:39` — `window.location.href = \`https://auth.duin.home/login?next=…\``. Hard-coded URL with no env override.
  - But: `src/App.tsx:53` — `<Route path="/login" element={<Login />} />` already exists locally. The non-dev path bypasses the in-app login screen entirely and bounces to an SSO endpoint.
- **Recommendation:** Either (a) read the URL from `import.meta.env.VITE_AUTH_URL` and document the fallback, or (b) drop the redirect and route everyone to `/login` (consistent with dev). Today prod and dev behave fundamentally differently — half-finished SSO migration.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F4-26: `Session.tsx` swallows `loadSelectedLessonScope` failure with a Dutch-only error
- **Severity:** cleanup
- **Category:** inconsistency
- **Evidence:**
  - `src/pages/Session.tsx:96-100` — `setError('Deze les is nog niet klaar om te oefenen.')` — raw Dutch literal, not localised.
  - `src/pages/Session.tsx:142` — `setError(\`Sessie laden mislukt: ${errMsg}\`)` — same.
  - `src/pages/Session.tsx:191-205` / `:215` — `title="Sessiefout"`, `title="Sessie laden"` — same.
- **Recommendation:** Pull through `useT()` like every other page. NL fallback is fine but the strings must come from `i18n.ts`.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-27: `LocalPreview` routes have no auth/admin gating despite being a dev-only surface
- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** misplaced-logic
- **Evidence:**
  - `src/App.tsx:55-56` — `<Route path="/preview" element={<LocalPreviewIndex />} />` and `<Route path="/preview/lesson/:slug" element={<LocalPreviewLesson />} />` are *outside* the `<Layout>` block AND not wrapped in `<ProtectedRoute>`. They render only when `VITE_LOCAL_CONTENT_PREVIEW=true` is set in the build env (`src/pages/LocalPreview.tsx:31, 59`).
  - But the gating is via Vite env, not a runtime check on the user — if a build accidentally ships with the flag on, anyone hitting `/preview` sees the content without logging in.
- **Recommendation:** Either drop the routes from prod builds (treeshake by importing only under the flag in App.tsx) or wrap in `<ProtectedRoute>` to keep them dev-only. The current shape is "secret-by-env" which is fragile.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F4-28: `activateStarterLessons` swallows `lessons` query error before it can be logged
- **Severity:** cleanup
- **Category:** error-handling
- **Evidence:**
  - `src/stores/authStore.ts:158-178` — first query is `supabase.…from('lessons').select(...)`, the destructure ignores the `error` field. If the query fails, `lessons` is `undefined` → `rows` empty → early return. Outer catch only fires on a thrown error.
- **Recommendation:** Destructure `error`, `if (error) throw error` so the outer `catch` + `logError({ page: 'auth', action: 'activate-starter-lessons', error: err })` actually triggers. Otherwise this is an invisible failure mode.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-29: `Profile.handleTimezoneChange` early-returns on null but is wired to a `Select` that can clear
- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `src/pages/Profile.tsx:142-163` — `if (!tz) return` means clearing the timezone is a no-op (state stays at the old value visually but db isn't updated). The `Select` at `src/pages/Profile.tsx:246-257` doesn't disable clearing.
- **Recommendation:** Either set `clearable={false}` on the `Select` (preferred — there is no "no timezone" state in DB) or handle the null case by reverting to a sensible default.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F4-30: `LocalPreview.tsx` empty error states use English-mixed Dutch hardcoded strings
- **Severity:** nice-to-have
- **Category:** inconsistency
- **Evidence:**
  - `src/pages/LocalPreview.tsx:18-26` — `title="Lokale contentpreview staat uit"`, `message="Zet VITE_LOCAL_CONTENT_PREVIEW=true in .env.local en herstart Vite om deze route te gebruiken."`
  - `src/pages/LocalPreview.tsx:34-38` — `title="Bekijk de nieuwe leerervaring zonder Supabase."`. Mix of dev-only English variable name and Dutch UX copy.
- **Recommendation:** Dev-only preview page — acceptable to leave NL-only, but call this out in a code comment so it's not flagged later as i18n drift.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

## Open questions for orchestrator

- **F4-25 SSO redirect:** Is there an `auth.duin.home` SSO product, or was that aspirational? CLAUDE.md says the app is "frontend-only, no custom backend" — the bounce-to-SSO contradicts that. Worth confirming before recommending a fix direction.
- **F4-9 NL-only on Login/Register:** Intentional (user has no profile yet so no language preference), or oversight? If intentional, document it.
- **F4-12 admin-gating of `/content/sections` and `/content/exercises`:** Are these intentionally public to all logged-in users (so non-admins can see what content exists)? Sidebar wires them as plain nav, but pages name themselves `ContentCoverage` and read pipeline tables — implies admin tool.

## Coverage notes

- Did not deeply review `src/components/Layout.tsx` / `MobileLayout.tsx` / `Sidebar.tsx` — agent 3's slice. Only grepped to confirm admin-link wiring for F4-12.
- Did not open `src/components/ProtectedRoute.tsx` as primary, but pulled it in because `App.tsx` routing wiring is mine and the dev-bypass touches `authStore`.
- All errors-as-notifications gaps are listed above; the rest of the owned pages (Profile, Podcasts, Podcast, Leaderboard, ContentReview except F4-16) all correctly call `logError` + `notifications.show` per CLAUDE.md.
- The Supabase auth-deadlock `setTimeout(0)` wrap is correctly applied at `src/stores/authStore.ts:58-83` and `:88-92`.
- No password-reset / email-confirmation code residue found anywhere in the owned files — clean on that vector.
