# UX failure-mode audit — 2026-07-02 — pre-cloud-hardening (Follow-up B)

**Read-only.** No code changed, nothing committed. Question driving every finding: *what does a real
user actually see when things go wrong, are slow, or are empty* — with "the app is about to get its
first paying customers" as the lens, not "is this technically handled."

**Sources read (file:line cited inline per claim):** `src/App.tsx`, `src/main.tsx`,
`src/components/ProtectedRoute.tsx`, `src/components/Layout.tsx`, `src/stores/authStore.ts`,
`src/pages/{Login,Register,Dashboard,Lessons,LessonRouter,Session,Podcasts,Podcast,Lezen,LezenReader,
AffixTrainer,Pronunciation,Profile,Progress}.tsx`, `src/components/lessons/{ActivationGate,
PracticeActions}.tsx`, `src/hooks/useLessonActivation.ts`, `src/pages/lessons/lesson-1/Page.tsx`,
`src/lib/session-builder/{builder,compose,drying}.ts`, `src/components/experience/{ExperiencePlayer,
RecapScreen,CapabilityExerciseFrame,buildFeedbackInput,feedbackCopy}.tsx`,
`src/lib/useExerciseScoring.ts`, `src/components/exercises/ExerciseErrorBoundary.tsx`,
`src/components/exercises/implementations/RecognitionMCQ.tsx`, `src/services/capabilityReviewService.ts`,
`src/lib/reviews/capabilityReviewProcessor.ts`, `src/lib/supabase.ts`, `src/components/progress/
MasteryFunnelPanel.tsx`, `src/components/progress/MasteryJourney.tsx`, `src/components/collections/
Woordenlijsten.tsx`, `vite.config.ts`, `node_modules/vite-plugin-pwa/dist/{index.js,client/build/
register.js}` (v1.3.0, to ground the exact `autoUpdate` runtime behavior), `node_modules/@mantine/core/
esm/components/Button/Button.mjs`, `docs/current-system/infrastructure.md`,
`docs/code-review-2026-05-20/agent-4-auth-pages-admin.md` (prior findings re-verified against current
code, not re-derived from scratch), and `homelab-configs/services/duinhuis-auth/app/src/app/login/
page.tsx` (to confirm what the SSO redirect target actually requires).

---

## Executive summary

- **1 CRITICAL, 10 MAJOR, 5 MINOR** findings below.
- The single highest-impact bug: **`ProtectedRoute` bounces every logged-out visit to a protected route
  to `https://auth.duin.home/login`** (`src/components/ProtectedRoute.tsx:39`) — a homelab-only SSO login
  form that expects a `duin.home` **username**, not the customer's own email
  (`homelab-configs/.../duinhuis-auth/app/src/app/login/page.tsx:27-30`: `` `${username}@duin.home` ``).
  Any paying customer who visits the bare app URL, bookmarks it, or has their session expire never sees
  this app's own `/login` — they hit a login form they structurally cannot use, with no link back. This
  was already flagged as a "cleanup"-severity item in the 2026-05-20 review (F4-25) and is still
  unfixed; under the "first paying customers" lens it is a CRITICAL onboarding blocker, not cleanup.
- Second theme: **optimistic UI that lies about failure.** The session player advances on every answer
  regardless of whether the server actually recorded it, and tells the learner "we'll retry it later" —
  no retry code exists anywhere in the repo (confirmed by grep). The review is silently dropped forever.
- Third theme: **several genuinely-empty states have no loading indicator or no error affordance at
  all** (Progress's default tab renders `null` while loading; the Lezen reader renders a bare blank body
  on fetch failure) — not full dead ends (the sidebar nav always persists, see `Layout.tsx:83`), but
  confusing "is this broken?" moments for a brand-new customer exploring the app for the first time.
- What already works well and should **not** be touched: Mantine's `Button loading` prop hard-disables
  submit buttons (`@mantine/core/esm/components/Button/Button.mjs:72`) so Login/Register/answer taps are
  double-submit-safe; a broken exercise render self-heals via `ExerciseErrorBoundary` (auto-skip, no user
  action needed); the PWA auto-update flow is fully wired (`skipWaiting`+`clientsClaim`+reload) so stale
  clients do get new code — its only problem is *when* it fires (mid-session, see MAJOR-5); lesson
  activation (`useLessonActivation.ts`) is a model instance of optimistic-update-with-rollback-and-toast.

---

## 1. Login

| # | Sev | State | What the user sees | Cite | Fix (not implemented) |
|---|---|---|---|---|---|
| — | — | Loading/Error | Handled well: `signIn` failure → red notification "Incorrect email or password" (`src/pages/Login.tsx:28-33`); submit button auto-disables via Mantine's `loading` prop, so double-submit is impossible. | `src/pages/Login.tsx:21-37` | — |
| CRIT-1 | **CRITICAL** | Error / dead-end | See Executive Summary — this is the flow that actually reaches the broken redirect (any expired-session or logged-out deep link). | `src/components/ProtectedRoute.tsx:33-41` | Route to this app's own `/login` in prod too (match dev behavior at line 36-37), or gate the SSO bounce behind a real decision about whether `auth.duin.home` is meant for paying customers at all. |

## 2. Register (invite-gated)

| # | Sev | State | What the user sees | Cite |
|---|---|---|---|---|
| — | — | Error | Well-handled: `FunctionsHttpError` body is parsed for a `{error: <code>}` and mapped to `invalid_invite_code` / `email_taken` / `rate_limited` / generic fallback, each with its own translated message; unknown/unparseable error bodies fall back gracefully. | `src/pages/Register.tsx:20-28,56-70` | 
| MIN-1 | MINOR | — | Auth pages are NL-only regardless of browser language (no profile exists yet to read a language preference from) — intentional per code comment, but worth confirming this is still the desired first impression for an EN-speaking paying customer. | `src/pages/Login.tsx:8-12`, `src/pages/Register.tsx:11-14` |

## 3. Dashboard load (first surface after login)

| # | Sev | State | What the user sees | Cite |
|---|---|---|---|---|
| — | — | Loading | `LoadingState` shown while `Promise.all([practiceTime, dailyActivity, getWeeklyMovement])` resolves; no timeout on any of the three calls (see systemic MAJOR-8). | `src/pages/Dashboard.tsx:54-93` |
| — | — | Error | Caught, notification shown, `finally` still clears loading so the page renders with zeroed-out stats instead of hanging — good degrade. | `src/pages/Dashboard.tsx:71-80` |
| — | — | Empty (fresh account) | Renders cleanly: streak 0, "same as last week", "no movement yet" — not broken, just informationally empty (see First-Run narrative §A). | `src/pages/Dashboard.tsx:96-110` |
| MIN-2 | MINOR | — | "Welkom terug" / "Welcome back" copy shows on a brand-new account's very first visit (gated only on "not seen today", not on account age). | `src/pages/Dashboard.tsx:42-52`, `src/lib/i18n.ts:78` |

## 4. Lessons list + lesson reader

| # | Sev | State | What the user sees | Cite |
|---|---|---|---|---|
| — | — | Loading/Empty | `LoadingState`/`EmptyState` used correctly; `LessonRouter` gives an explicit "Les niet gevonden" + CTA back to `/leren` for an unregistered lesson id — no dead end. | `src/pages/Lessons.tsx:280-288`, `src/pages/LessonRouter.tsx:27-38` |
| MAJ-1 | MAJOR | Error | `getLessonsOverview` failure shows a bare inline `<div role="status">` instead of the repo's `notifications.show(...)` convention used everywhere else — still visible (not a dead end), but inconsistent and easy to miss below the fold. | `src/pages/Lessons.tsx:245-250,361-365` |
| MAJ-2 | MAJOR | Error (silent) | `PracticeActions` (the "Practice this lesson" CTA on every bespoke lesson page) swallows its fetch error with `logError` only — **no `notifications.show`** — so a network blip renders the exact same disabled "Geen oefeningen beschikbaar" button as a lesson that genuinely has zero content. The customer cannot tell "temporary glitch" from "this lesson is actually empty." Violates the repo's own error-handling rule (CLAUDE.md: never log-only). | `src/components/lessons/PracticeActions.tsx:26-37,51-57` |
| — | — | Activation toggle | Model implementation: optimistic update, rollback + red notification on RPC failure, teal success toast. | `src/hooks/useLessonActivation.ts:40-65` |
| MIN-3 | MINOR (pre-existing) | Edge case | Already flagged in the 2026-05-20 review (F4-28), still present: `activateStarterLessons`'s first query destructures `data` only, never `error` — a failed `lessons` fetch on first sign-in silently activates nothing and never reaches the `catch`/`logError`. Directly relevant to first-run (see §A). | `src/stores/authStore.ts:160-169` |

## 5. Session (init → answering → mid-session network loss → completion/recap)

| # | Sev | State | What the user sees | Cite |
|---|---|---|---|---|
| — | — | Loading | `LoadingState caption="Sessie laden..."` while `buildSession` resolves, then a second "Inhoud wordt voorbereid…" alert while render-contexts + audio resolve — two-stage loading is visible and reasonable. | `src/pages/Session.tsx:227-260` |
| — | — | Error (init) | Unresolvable lesson/affix scope → friendly Dutch error, not a crash; other init failures → translated `failedToLoadSession`. Both render inside `Layout`, so nav stays reachable. | `src/pages/Session.tsx:110-125,164-169` |
| MAJ-3 | MAJOR | Empty (0 renderable cards) | The learner sees **"Niets te doen — Er zijn geen kaarten beschikbaar voor deze sessie."** and a single "Terug naar dashboard" button. No explanation of *why* (nothing activated yet? everything already reviewed today? content gap?) and no link to `/leren` to fix it. This is exactly what a brand-new account sees if starter-lesson activation didn't land in time or failed silently (MIN-3), or what any account sees once genuinely caught up. | `src/components/experience/RecapScreen.tsx:23-34` |
| MIN-4 | MINOR (code hygiene) | — | `Session.tsx`'s yellow "Geen oefeningen" fallback (rendered when `capabilityPlan` is falsy) is unreachable: `buildSession` → `compose()` always returns a `SessionPlan` object, so `capabilityPlan` is either set or `error` was already set instead. The *real* 0-card UX is MAJ-3 above, not this branch — noted so it isn't mistaken for the empty-state owner in a future change. | `src/pages/Session.tsx:296-304`, `src/lib/session-builder/compose.ts:117-125` |
| **MAJ-4** | **MAJOR** | **Mid-session answer-commit failure** | Per-answer flow: `useExerciseScoring.runScoring` dispatches the UI to `answered-correct/-fuzzy/-wrong` **synchronously**, then fires `onAnswer` as a side effect — the reducer does not wait for it (`commit succeeds optimistically; FSRS cache writes are gated on onAnswer success` — but nothing ever re-runs that gate). Up in `ExperiencePlayer.handleAnswerReport`, a thrown commit is caught: if the answer was correct, a yellow toast reads **"Antwoord niet opgeslagen — We proberen het later opnieuw"** (*we'll try again later*); the block is marked in `commitFailedBlocks` and the queue advances/re-queues exactly as if the commit had succeeded. **No retry/outbox/queue code exists anywhere in the repo** (verified by grep across `src/lib/reviews`, `src/services`, `src/components/experience`) — the promised retry never happens. The capability's FSRS state (`learner_capability_state`) is simply never updated; a `new_introduction` capability whose activation commit failed stays `dormant` and will silently resurface as a "new" word next session with no memory that the learner already saw it. The RecapScreen repeats the same false promise ("we proberen ze later opnieuw"). The **only** honest copy in this whole path is the *wrong-answer* feedback card, which correctly says "Kon beoordeling niet opslaan — we gaan toch door" (no retry claim). | `src/lib/useExerciseScoring.ts:254-282`, `src/components/experience/ExperiencePlayer.tsx:172-234`, `src/components/experience/RecapScreen.tsx:48-66`, `src/components/experience/feedbackCopy.ts:19,39`, `src/services/capabilityReviewService.ts:15-24` (single-shot `functions.invoke`, throws, no retry) |
| — | — | Completion | `onComplete` fires exactly once, only when `queueLength > 0`, gated by a ref — an empty session correctly does *not* get recorded as "completed" for streak purposes. Completion recording is best-effort (own try/catch) and never traps the learner on the recap screen even if `markSessionComplete` fails. | `src/components/experience/ExperiencePlayer.tsx:154-163`, `src/pages/Session.tsx:179-191` |
| — | — | Render crash | A single broken exercise (bad content, render exception) self-heals via `ExerciseErrorBoundary`: auto-fires a skip, shows a friendly "Even overslaan / Let's skip this one" card, no user action required. Well designed — one bad card cannot kill a session. | `src/components/exercises/ExerciseErrorBoundary.tsx:38-73` |
| MIN-5 | MINOR | Back-button | No `useBlocker`/`beforeunload` guard anywhere in Session/ExperiencePlayer (confirmed by repo-wide grep). Not destructive — every answer is committed server-side as it happens, so only the in-memory queue/recap view is lost — but the learner gets zero "are you sure?" warning and never sees their own "N saved / M not touched" summary if they navigate away mid-session. | n/a (absence confirmed) |

## 6. Podcasts list + player + follow-along

| # | Sev | State | What the user sees | Cite |
|---|---|---|---|---|
| — | — | Loading/Empty/Error | All three states present and correct: `LoadingState`, `EmptyState` with icon+message for zero podcasts, red notification + `EmptyState` fallback on fetch failure. | `src/pages/Podcasts.tsx:45-64`, `src/pages/Podcast.tsx:104-142` |
| MIN-6 | MINOR | Error copy | The `Podcast.tsx` failure `EmptyState` message is hardcoded English (`"Failed to load podcast."`), not pulled through `T`, so a Dutch-profile customer sees an English sentence on this one error path only. | `src/pages/Podcast.tsx:137` |
| MIN-7 | MINOR | Playback | `<audio src={audioUrl}>` is rendered with `audioUrl=''` whenever a text row has neither `audio_path` nor (for EN users) `audio_path_en` — there is no defensive guard/EmptyState inside `Podcast.tsx` itself for that case; it relies entirely on `textService.listPodcasts()` upstream already filtering to audio-bearing rows. | `src/pages/Podcast.tsx:149-193` |
| — | — | Follow-along | Segment/word highlighting degrades gracefully to a plain prose block when an episode has no `transcript_segments` (legacy/un-timed rows) — no broken UI. | `src/pages/Podcast.tsx:47-49` |

## 7. Lezen list + reader

| # | Sev | State | What the user sees | Cite |
|---|---|---|---|---|
| — | — | Loading/Empty | `Lezen.tsx` list page: correct `LoadingState`/`EmptyState`/notification-on-error triad. | `src/pages/Lezen.tsx:54-67` |
| **MAJ-5** | **MAJOR** | **Error (reader)** | `LezenReader.fetchData`'s catch block fires a notification toast (which auto-dismisses) but **never sets any error/failed state**. Render logic is `loading ? <LoadingState/> : reader ? (<content>) : null` — on failure, `reader` stays `null` forever, so once the toast is gone the page shows **nothing but the "back to list" link**: no message, no retry button, no icon. Contrast with `Podcast.tsx`'s `EmptyState` pattern for the identical failure class — this is the one reader in the audit with a true blank-body dead end. | `src/pages/LezenReader.tsx:50-74,76-95` |
| — | — | Harvest action | `handleHarvest` re-throws after showing a red notification so `GlossableText` can revert its button to pre-confirm state — correct pattern, no silent failure. | `src/pages/LezenReader.tsx:34-48` |

## 8. AffixTrainer / Pronunciation

Both pages follow an identical, clean loading/error/notFound/empty template with translated copy and
no dead ends — nothing to flag beyond noting they're the best-instrumented pages in the audit.

`src/pages/AffixTrainer.tsx:31-89`, `src/pages/Pronunciation.tsx:29-83`

## 9. Profile

| # | Sev | State | What the user sees | Cite |
|---|---|---|---|---|
| — | — | Save actions | Every field (display name, language, session size, timezone) follows the same pattern: optimistic-or-guarded update, success/red-error toast, rollback on failure where relevant (session size, timezone). | `src/pages/Profile.tsx:76-163` |
| MIN-8 | MINOR (pre-existing, F4-29) | Edge case | `handleTimezoneChange` early-returns on a cleared value (`if (!tz) return`) but the `Select` has no `clearable={false}`, so clearing it is a silent no-op that leaves the UI visually blank without persisting or reverting. Confirmed still present. | `src/pages/Profile.tsx:142-143,246-257` |

## 10. Progress / analytics

| # | Sev | State | What the user sees | Cite |
|---|---|---|---|---|
| **MAJ-6** | **MAJOR** | **Loading (default tab)** | `MasteryFunnelPanel` — the component behind the default "Woordenschat" tab and also "Grammatica"/"Morfologie" — has **no loading state at all**: `if (!data) return null`. While `getMasteryFunnels` is in flight (this is the very first thing a customer sees after finishing their first session and tapping "Voortgang"), the content area is completely blank below the header/tab pills — no spinner, no skeleton. When data resolves the whole panel pops in at once (visible layout shift). A slow or hung RPC here reads as "this page is broken," not "loading." | `src/components/progress/MasteryFunnelPanel.tsx:45-58` |
| — | — | Error | Caught, notification shown; `data` simply never gets set so the blank state above persists indefinitely (same gap, worse trigger). | `src/components/progress/MasteryFunnelPanel.tsx:49-52` |
| — | — | Empty (fresh account) | Renders sensibly once data resolves: zero-value funnel with `max = Math.max(1, ...)` avoiding div-by-zero, "0 woorden gemasterd" headline — not broken, just not particularly welcoming (no "start a lesson to see progress" CTA). | `src/components/progress/MasteryJourney.tsx:19-40` |
| — | — | Other tabs | `Woordenlijsten` (Lessons page's second tab) has the full correct triad (loading/empty/error+notification). | `src/components/collections/Woordenlijsten.tsx:47-95` |

## 11. Systemic / cross-cutting

| # | Sev | Finding | Cite |
|---|---|---|---|
| **MAJ-7** | **MAJOR** | **No request timeout anywhere.** `src/lib/supabase.ts` creates a plain `createBrowserClient` with no custom `fetch`, no `AbortController`, no timeout wrapper (confirmed: zero hits for "timeout"/"AbortController" across `src/`). A hung RPC (slow homelab link, DB lock, cold edge function) leaves whichever page's `LoadingState` spinner running indefinitely — no cancel button, no "still working…" escalation, anywhere in the app. Partially mitigated: `Layout.tsx:83`'s `<Outlet/>` always renders the sidebar/bottom-nav outside the page content, so the user can always navigate away — nobody is *fully* trapped, just stuck in whatever view they were on. | `src/lib/supabase.ts:4-18`, `src/components/Layout.tsx:83` |
| **MAJ-8** | **MAJOR** | **No offline indication anywhere.** Repo-wide grep for `navigator.onLine`/`offline`/`beforeinstallprompt` returns zero hits in `src/`. The PWA shell (JS/CSS/HTML) is precached by Workbox's default `generateSW` glob so the app boots offline, but literally every Supabase query/RPC/edge-function call still fires and fails once offline — each page shows its own independent error toast or blank state (including MAJ-5's true dead end) with no unifying "you appear to be offline" banner anywhere. To a customer this reads as "the app is broken," not "I have no signal." | `vite.config.ts:9-37` (no offline UI plumbing anywhere in the plugin config or app code) |
| MAJ-9 | MAJOR | **PWA runtime caching covers only per-word TTS clips.** The single `runtimeCaching` rule matches `/storage/v1/object/public/indonesian-tts/` only. `indonesian-lessons` (lesson narration audio) and `indonesian-podcasts` (podcast/story audio) are never added to any Workbox cache strategy, so audio a learner already listened to is not guaranteed available offline — contrary to the normal "I already downloaded/played this" PWA/podcast-app expectation. | `vite.config.ts:15-22`, cross-checked against bucket usage at `src/services/{audioService.ts:94,textService.ts:134,lessonService.ts:16}` |
| **MAJ-10** | **MAJOR** | **PWA auto-update force-reloads mid-session with zero warning.** `registerType: 'autoUpdate'` (`vite.config.ts:12-13`) resolves, via `injectRegister: 'auto'`, to `workbox.skipWaiting = true` + `workbox.clientsClaim = true` (`node_modules/vite-plugin-pwa/dist/index.js:874-876`) and an injected register script that does `wb.addEventListener('activated', (event) => { if (event.isUpdate ...) window.location.reload() })` with no app-supplied `onNeedReload` override (`node_modules/vite-plugin-pwa/dist/client/build/register.js:38-47`; confirmed no `virtual:pwa-register` import anywhere in `src/`). Net effect: the moment a new deploy's service worker activates in the background — which can happen at any time, including mid-`ExperiencePlayer` session — the tab **force-reloads immediately**, discarding the in-flight queue/recap with no confirmation dialog. Individually-answered cards are safe (each commits server-side as it happens per MAJ-4's model), but the learner is yanked out mid-exercise with no notice. | `vite.config.ts:12-13`, `node_modules/vite-plugin-pwa/dist/index.js:874-876`, `node_modules/vite-plugin-pwa/dist/client/build/register.js:38-47` |
| — | — | **Double-submit protection — works.** Mantine's `Button` hard-sets `disabled: disabled \|\| loading` (verified in source), so every `loading`-driven submit button in this audit (Login, Register, Profile saves) cannot be double-tapped. Exercise answers are separately guarded by `useExerciseScoring`'s reducer (`state.phase` leaves `'idle'`/`'wrong-retry'` the instant an answer is dispatched, so `selectOption`/`submit` become no-ops) and `ExperiencePlayer.handleAnswerReport`'s own `if (!currentBlock \|\| submitting) return`. No double-submit findings anywhere. | `node_modules/@mantine/core/esm/components/Button/Button.mjs:72`, `src/lib/useExerciseScoring.ts:316-332`, `src/components/experience/ExperiencePlayer.tsx:173` |

---

## A. First-run experience — the literal walkthrough

1. **Invite arrives.** A prospective customer gets an invite code and (presumably) a link straight to
   `/register` — this route is *not* behind `ProtectedRoute` (`src/App.tsx:87-88`), so a direct link
   always works regardless of auth state.
2. **Register.** They fill in name/email/password/invite code (`src/pages/Register.tsx:76-124`), submit
   once (button hard-disables — no double-submit risk), the `signup-with-invite` edge function runs, on
   success they're signed in, see a green "Registratie gelukt" toast, and land on `/`.
3. **Background activation races the page.** The instant `SIGNED_IN` fires, two `setTimeout(0)`-deferred
   jobs run: the profile upsert, and `activateStarterLessons` which tries to activate lessons 1-3 via the
   `set_lesson_activation` RPC (`src/stores/authStore.ts:93-98,160-178`). This is fire-and-forget and
   its first query's `error` is never checked (MIN-3) — a transient failure here is invisible to both
   the customer and the logs.
4. **First Dashboard.** Zeroed-out but coherent: "Welkom terug" (odd copy for a first visit, MIN-2), 0
   streak, "gelijk aan vorige week," "nog geen vooruitgang" — and exactly one CTA: **"Start sessie."**
   Nothing on this page explains *how* the app works or nudges the customer toward `/leren` first.
5. **They tap "Start sessie."** Two outcomes are possible and the customer cannot tell in advance which
   one they'll get:
   - **Happy path (activation landed in time):** lessons 1-3 are active, `buildSession` surfaces
     `new_introduction` capabilities from lesson 1, a real session renders. This is very likely in
     practice since human read/click time comfortably exceeds a `setTimeout(0)` tick.
   - **Unhappy path (activation silently failed, or the account is later fully caught up):** the
     customer lands directly on RecapScreen's **"Niets te doen"** message (MAJ-3) with a single button
     back to a Dashboard that still only offers "Start sessie" — a soft loop with no diagnosis and no
     link to `/leren` to self-activate a lesson.
6. **If they explore `Leren` instead of / after Session,** lesson tiles correctly reflect activation
   state and the per-lesson `ActivationGate` checkbox is a genuinely well-built, low-risk control if they
   need to activate anything manually — this is the one part of onboarding that is fully robust to
   failure (rollback + toast on error).
7. **If they close the tab and come back later** (new day, session cookie expired, different device, or
   simply logged out) and revisit the bare app URL, they hit **CRIT-1**: bounced to a homelab SSO login
   page that structurally cannot authenticate them. This is the single most likely way a real early
   customer gets permanently stuck, and it can happen on day one.

## B. Top 5 improvements ranked by impact

1. **Fix the `ProtectedRoute` SSO redirect (CRIT-1).** Route unauthenticated visits to this app's own
   `/login` in production (matching the existing dev branch), or make the SSO decision explicit and
   correct for non-`duin.home` customer emails. Every other finding in this report is reachable only
   *after* a customer gets past this gate — this blocks return visits, not just first-run.
2. **Give the empty-session recap an actionable next step (MAJ-3).** "Niets te doen" → a message that
   distinguishes "nothing due right now" from "no lesson activated yet," with a direct link/CTA into
   `/leren`. This is the exact scenario a brand-new or activation-failed account hits immediately after
   registering.
3. **Fix `activateStarterLessons`'s swallowed error (MIN-3), pair with #2.** Fifteen minutes of work
   (destructure `error`, `if (error) throw`) turns a silent first-sign-in failure into a logged,
   diagnosable one instead of an inert-looking new account.
4. **Make the answer-commit-failure message honest, or build the retry it promises (MAJ-4).** Telling a
   paying customer "we'll try again later" when nothing ever retries is the kind of small trust-breaker
   that surfaces later as "why do I keep seeing the same word" support questions once there's real usage
   to notice the pattern.
5. **Add a loading state to `MasteryFunnelPanel` (MAJ-6) and a real error state to `LezenReader` (MAJ-5).**
   Both are blank-content moments a first-week customer is likely to hit while exploring Progress/Lezen
   right after their first session — cheap, isolated fixes with an outsized "does this app work?"
   impression cost today.
