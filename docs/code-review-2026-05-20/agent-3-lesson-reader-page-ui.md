# Agent 3: Lesson reader & page UI

**Date:** 2026-05-20
**Files reviewed:** 55

## Files reviewed

- `src/components/lessons/` — LessonReader.tsx, LessonReader.module.css, ActivationGate.tsx, LessonAudioPlayer.tsx, PracticeActions.tsx, blocks/LessonBlockRenderer.tsx
- `src/components/page/primitives/` — all 14 primitives + index.ts + cx.ts + useSeamContract.ts
- `src/components/experience/` — ExperiencePlayer.tsx, CapabilityExerciseFrame.tsx, RecapScreen.tsx, buildFeedbackInput.ts, feedbackCopy.ts, types.ts, __tests__
- `src/components/progress/` — MemoryHealthHero.tsx, MasteryFunnel.tsx, VulnerableItemsList.tsx, ReviewForecastChart.tsx, DetailedMetrics.tsx (+ all .module.css)
- `src/components/dashboard/RecencyBadge.tsx`
- `src/components/Layout.tsx`, `Layout.module.css`, `MobileLayout.tsx`, `MobileLayout.module.css`, `Sidebar.tsx`, `Sidebar.module.css`, `ProfileMenu.tsx`, `ProfileMenu.module.css`, `IndoText.tsx`, `PlayButton.tsx`, `ProtectedRoute.tsx`
- `src/pages/Lessons.tsx`, `Lessons.module.css`, `Lesson.tsx`, `Dashboard.tsx`, `Progress.tsx`, `Progress.module.css`
- `src/pages/lessons/lesson-1/Page.tsx`, `Page.module.css`, `content.json`
- `src/App.tsx` (route table cross-checks)

## Findings

### F3-1: Dashboard "Continue lesson" URL targets nonexistent route — link is silently broken
- **Severity:** blocker
- **Category:** bug
- **Evidence:**
  - `src/pages/Dashboard.tsx:62` — ``setContinueUrl(`/lessons/${target.id}?section=${sectionIndex}`)``
  - `src/App.tsx:68` — `path="/lessons"` (the list page)
  - `src/App.tsx:76` — `path="/lesson/:lessonId"` (the detail page — singular)
- **Recommendation:** Change template to `/lesson/${target.id}` (singular). React Router will silently match `/lessons/<id>` against `/lessons` because the `:lessonId` param lives under `/lesson/`, so the user is currently bounced back to the lesson list whenever the dashboard's "Continue lesson" tile is clicked. Add a regression test that asserts the constructed href.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-2: RecencyBadge has dead `messageSingular` branch — ageDays===1 is unreachable
- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/components/dashboard/RecencyBadge.tsx:11` — `if (ageDays === null || ageDays <= 2) return null`
  - `src/components/dashboard/RecencyBadge.tsx:12-14` — `const template = ageDays === 1 ? T.dashboard.recencyBadge.messageSingular : T.dashboard.recencyBadge.message`
  - `src/__tests__/RecencyBadge.test.tsx:35-43` — tests assert nothing renders at ageDays 0, 1, or 2
  - `src/lib/i18n.ts:30` — `messageSingular: 'Je laatste sessie was {days} dag geleden. Welkom terug.'`
- **Recommendation:** Either lower the threshold to `ageDays <= 0` (then the singular branch fires for `days === 1`) — and update the tests — or drop the `messageSingular` keys from i18n.ts and simplify the component to a single template. The current state ships a singular string nobody can ever see.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-3: `IndoText` component is dead — zero callsites
- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/components/IndoText.tsx:25,70` — exports `IndoText` named + default
  - `grep -rn "import.*IndoText\|from.*IndoText" src/` returns only the file itself; no consumer in pages, components, exercises, or tests
- **Recommendation:** Delete the file. If the morphology highlighter is intended for future use (per the comment block) the design lives in `src/lib/morphology/` — keep the algorithm there and re-introduce a wrapper component when a real consumer exists.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-4: Lesson.tsx activation banner uses raw `<Paper>` outside any PageContainer — primitive bypass + visual orphan
- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** primitive-bypass
- **Evidence:**
  - `src/pages/Lesson.tsx:203-225` — top-level fragment renders `<Paper withBorder radius="md" p="md" mx="md" my="sm">` containing a Mantine `<ThemeIcon>` + `<Checkbox>`, then `<LessonReader/>` (which has its own `PageContainer`)
  - `src/components/page/primitives/index.ts:24-25` — `SettingsCard` already exists for "card + label + control" composition
- **Recommendation:** Wrap the activation banner in a primitive (SettingsCard or a new `BannerCard`) and place it inside the LessonReader's companion column, or above the reader inside a shared `PageContainer`. Right now the banner floats outside the page container's width constraints with hand-applied `mx="md"`. Per CLAUDE.md the page-framework migration is meant to be ~16/18 surfaces — this one is regressing.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F3-5: `LessonAudioPlayer` bypasses the page framework by using Mantine `<Paper>` directly
- **Severity:** nice-to-have
- **Category:** architecture-violation
- **Subtype:** primitive-bypass
- **Evidence:**
  - `src/components/lessons/LessonAudioPlayer.tsx:11` — `<Paper withBorder radius="md" p="sm">` (the only chrome the component owns)
- **Recommendation:** Either drop the Paper (the bespoke lesson-1 page already wraps it in `.audioBand`) or replace with a token-driven `<div className={classes.card}>` so the audio player works the same in any host. A 12-line component owning Mantine chrome it doesn't need is a bypass that creeps into other lesson pages once they're cloned from lesson-1.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-6: `LessonAudioPlayer` accepts and discards `voice` prop — type/API hole
- **Severity:** cleanup
- **Category:** type-hole
- **Evidence:**
  - `src/components/lessons/LessonAudioPlayer.tsx:5-9` — comment "`voice` is accepted but unused (kept on the prop surface so callers passing it from the data fetcher don't need to change)"
  - `src/components/lessons/LessonAudioPlayer.tsx:9` — destructures only `src`, ignores `voice`
- **Recommendation:** Drop `voice` from the prop type and from the lesson-1 callsite (`Page.tsx:324`). A documented "we kept this prop for future use" almost always rots into a phantom contract; if the prop is needed for cache-keys/analytics later, re-add when the consumer lands.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-7: `ActivationGate` hardcodes NL strings instead of going through `useT` — duplicates existing keys
- **Severity:** cleanup
- **Category:** i18n-drift (inconsistency)
- **Evidence:**
  - `src/components/lessons/ActivationGate.tsx:32-43` — `notifications.show({ color: 'teal', message: next ? 'Les toegevoegd aan oefeningen' : 'Les verwijderd uit oefeningen' })` and `title: 'Activatie mislukte', message: 'Probeer het later opnieuw.'`
  - `src/components/lessons/ActivationGate.tsx:54` — `label="Activeer deze les en voeg de woorden en patronen toe aan je oefeningen."`
  - `src/lib/i18n.ts:141-145` — `activateThisLesson`, `activateThisLessonHint`, `lessonActivated`, `lessonDeactivated`, `activationFailed` already exist and `src/pages/Lesson.tsx:159-165` uses them
- **Recommendation:** Replace the hardcoded strings with `useT()` lookups. The two activation entrypoints (Lesson.tsx checkbox and lesson-1's bespoke ActivationGate) currently emit divergent copy for the same action — Lesson.tsx says "Activeer deze les" + hint, ActivationGate says "Activeer deze les en voeg de woorden en patronen toe aan je oefeningen." in one combined label.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-8: `PracticeActions` and Lesson.tsx duplicate practice-count logic — should share a hook
- **Severity:** cleanup
- **Category:** duplication
- **Evidence:**
  - `src/pages/Lesson.tsx:68-101` — fetches `getLesson` → `getLessonPageBlocks` → aggregates source_refs → `Promise.all([getLessonCapabilityPracticeSummary, isLessonActivated])`
  - `src/components/lessons/PracticeActions.tsx:22-49` — verbatim same flow: `getLesson` → `getLessonPageBlocks` → flatMap source_refs → `Promise.all([getLessonCapabilityPracticeSummary, isLessonActivated])`
  - Both then call `buildLessonPracticeActions` (Lesson.tsx:137-143, PracticeActions.tsx:51-61) with the same `practiceReadyCount = activated ? max(0, ready - practiced) : 0` formula
- **Recommendation:** Extract `useLessonPracticeActions(lessonId)` returning `{ actions, loading, activated, readyCount }`. PracticeActions becomes a presentational shell; Lesson.tsx loses ~30 lines of duplicated state + fetch. Saves two parallel round trips when both render together (bespoke lesson-1 page) and makes the wiring testable in one place.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F3-9: ExperiencePlayer NL strings hardcoded in chrome — bypasses bilingual feedbackCopy seam
- **Severity:** cleanup
- **Category:** i18n-drift
- **Evidence:**
  - `src/components/experience/ExperiencePlayer.tsx:50` — `<Text size="sm" c="dimmed">Oefening {currentIndex + 1} van {total}</Text>`
  - `src/components/experience/ExperiencePlayer.tsx:51` — `{correctCount}/{currentIndex} correct`
  - `src/components/experience/ExperiencePlayer.tsx:139-141` — notification `title: 'Antwoord niet opgeslagen', message: 'We proberen het later opnieuw.'`
  - `src/components/experience/feedbackCopy.ts:3-50` — the file establishes a bilingual `FEEDBACK_COPY_NL` / `FEEDBACK_COPY_EN` pattern that the chrome ignores
- **Recommendation:** Either route the chrome strings through `useT` (the player already receives `userLanguage` as a prop and `profile` from the auth store) or extend `feedbackCopyFor` with `progressLabel`, `saveFailed*`, etc. The bilingual feedback panel inside the same component will say "Correct" in EN while the surrounding header still reads "Oefening 3 van 12".
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F3-10: `RecapScreen` hardcodes NL throughout — bilingual mode is broken at session end
- **Severity:** cleanup
- **Category:** i18n-drift
- **Evidence:**
  - `src/components/experience/RecapScreen.tsx:24-29` — empty-state `"Niets te doen"`, `"Er zijn geen kaarten beschikbaar..."`, `"Terug naar dashboard"`
  - `src/components/experience/RecapScreen.tsx:50,53` — `title="Sessieroute afgerond"`, `"{savedCount} van {effectiveTotal} vaardigheidskaarten zijn veilig opgeslagen."`
  - `src/components/experience/RecapScreen.tsx:71,75,79` — `"herhaald" / "geïntroduceerd" / "niet aangeraakt"`
  - `src/components/experience/RecapScreen.tsx:86-91` — `"Niet opgeslagen" / "Overgeslagen" / "Herhaling opgeslagen" / "Introductie gestart"`
- **Recommendation:** Pass `userLanguage` (and/or `useT`) into `RecapScreen` and feed it a copy bundle. Bilingual support is otherwise a paper promise — every session that crosses into the recap view loses translation.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F3-11: Sidebar admin item and lock-button tooltips are hardcoded NL — bypasses i18n
- **Severity:** cleanup
- **Category:** i18n-drift
- **Evidence:**
  - `src/components/Sidebar.tsx:45` — `[{ label: 'Contentcontrole', icon: <IconEye size={17} />, path: '/admin/content-review' }]` (other nav items use `T.nav.*`)
  - `src/components/Sidebar.tsx:59` — `title={locked ? 'Zijbalk losmaken' : 'Zijbalk vastzetten'}`
  - `src/components/Sidebar.tsx:103` — `title="Thema wisselen"`
  - `src/components/ProfileMenu.tsx:55` — `{profile?.fullName?.split(' ')[0] ?? profile?.email ?? 'Gebruiker'}` (fallback NL)
  - `src/components/ProfileMenu.tsx:56` — `<div className={classes.meta}>A1 - Beginner</div>` (hardcoded level — also a fake/placeholder string in a production menu)
  - `src/components/MobileLayout.tsx:22` — `<span className={classes.title}>Bahasa Indonesia</span>` (brand name is fine, but no other text uses translation either)
  - `src/components/Layout.tsx:68` — `aria-label="Zijbalk wisselen"`
- **Recommendation:** Add `T.nav.contentReview`, `T.sidebar.lockOn/Off`, `T.sidebar.themeToggle`, `T.profile.fallbackName` and `T.profile.levelPlaceholder` (or remove the level pill entirely until per-user level lands). ProfileMenu line 56 is a misleading hardcoded placeholder.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F3-12: `Layout.tsx` hamburger button is a chunk of inline styles — should live in CSS module
- **Severity:** cleanup
- **Category:** inconsistency
- **Evidence:**
  - `src/components/Layout.tsx:46-52` — backdrop `<div onClick={closeOverlay} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }} />`
  - `src/components/Layout.tsx:55-71` — `<div style={{ position: 'fixed', left: 14, top: 14, zIndex: 198 }}><button onClick={toggleLock} style={{ width: 36, height: 36, ... colorScheme === 'light' ? ... : ...}}>` — hardcoded colors, blur, shadow, etc.
- **Recommendation:** Move into `Layout.module.css` with `.hamburger` / `.hamburgerLight` / `.backdrop` classes. The hand-rolled `colorScheme === 'light' ? ...` branches duplicate what a CSS class + `[data-mantine-color-scheme]` selector solves natively, and the magic numbers (199/198, 14, 36) silently drift out of sync with design tokens.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F3-13: `LessonBlockRenderer` `textFromPayload` is a structural-typing zoo with `as Record<string, unknown>` casts and copy-paste field lists
- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/components/lessons/blocks/LessonBlockRenderer.tsx:12-42` — `payload: Record<string, unknown>` then `for (const key of ['body','intro','description','label'])` style dispatch; `payload.categories.map` → `rawCategory as Record<string, unknown>` (line 24); same for examples
  - `src/components/lessons/blocks/LessonBlockRenderer.tsx:44-60` — `itemsFromPayload` repeats the pattern with 10 string keys at lines 48-57
  - `src/components/lessons/blocks/LessonBlockRenderer.tsx:62-76` — `primaryItemText` / `secondaryItemText` repeat the same key-list shape three more times
- **Recommendation:** Define a discriminated `LessonExperienceBlock.payload` union in `src/lib/lessons/lessonExperience.ts` and have the builder emit typed payloads per block kind. The renderer would dispatch on `block.kind` (already does) and read typed fields. Today, adding a new key to the payload requires updating four field lists scattered across this file and silently misses any miss.
- **Estimated effort:** medium
- **Cross-slice dependency:** null

### F3-14: Inline `PlayButton` reimplemented inside bespoke lesson-1 page — diverges from `src/components/PlayButton`
- **Severity:** cleanup
- **Category:** duplication
- **Evidence:**
  - `src/components/PlayButton.tsx:1-56` — canonical PlayButton uses `ActionIcon` + `IconVolume/IconPlayerStop`, reusable everywhere (used by 5 exercise components)
  - `src/pages/lessons/lesson-1/Page.tsx:29-53` — local `function PlayButton({ src })` with bespoke SVG, own `useRef<HTMLAudioElement>`, `data-playing` styling, aria label `'Stop' / 'Speel uit'` (typo? — `Speel af` is the Dutch idiom, `Speel uit` is unusual)
  - `src/pages/lessons/lesson-1/Page.module.css:861-890` — `.playButton` styling lives here
- **Recommendation:** Extract a `PlayDot` primitive in `src/components/page/primitives/` (or expose the bespoke styling as a size variant on PlayButton). Future per-lesson pages will copy this same shape unless there's a shared seam. Also fix the `'Speel uit'` label.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F3-15: Lesson 1 hero `<img>` is fetched as `/lesson-1-hero.webp` via CSS — silently 404s if asset missing
- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `src/pages/lessons/lesson-1/Page.module.css:42-46` — `background-image: linear-gradient(...), url('/lesson-1-hero.webp')`
  - `src/pages/lessons/lesson-1/Page.module.css:38-39` — comment "Themed image (drop your file at public/lesson-1-hero.jpg) blended... if it 404s the gradient still renders." (file extension mismatch: comment says `.jpg`, CSS says `.webp`)
- **Recommendation:** Either commit the asset to `public/lesson-1-hero.webp` (verify it exists — the comment says "drop your file" so the asset may not exist yet) or remove the URL. Currently every production load of `/lesson-preview/1` hits a 404 on a hero image that nobody is checking. Also reconcile the `.jpg` vs `.webp` typo in the comment.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-16: `Lessons.tsx` overview-scroll-restore effect has a race + a fragile dep array
- **Severity:** cleanup
- **Category:** bug
- **Evidence:**
  - `src/pages/Lessons.tsx:245-250` — `useEffect(() => { if (loading || didRestoreScrollRef.current) return; didRestoreScrollRef.current = true; ...window.scrollTo(0, storedScrollY) }, [loading])`
  - `src/pages/Lessons.tsx:252-254` — `useEffect(() => () => { rememberOverviewScrollPosition() }, [])` — only stores scroll on unmount
- **Recommendation:** Two problems: (1) scroll restore runs in the same `useEffect` tick that flips `loading: false`, before the actual `MediaShowcaseCard` heights have settled (no `useLayoutEffect`, no `requestAnimationFrame`) — restored scrollY routinely lands on the wrong row on slow paint. (2) `rememberOverviewScrollPosition` only fires on unmount; if the user reloads the page or navigates via in-app history-pop, scroll position is never persisted. Use `useLayoutEffect` for the restore + a `pagehide` / `visibilitychange` listener (or scroll listener with throttle) for the save.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F3-17: `ProtectedRoute` casts dev-bypass user to `any` twice
- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/components/ProtectedRoute.tsx:21-25` — `useAuthStore.setState({ user: { id: 'dev-user', email: 'dev@local' } as any, profile: {...}, loading: false } as any)`
- **Recommendation:** Build the dev user against the real `User` type from `@supabase/supabase-js` (or a narrow internal shape) so the bypass mirrors production fields. Two `as any` casts is the standard slow-poison pattern: when the store schema changes, the bypass silently drifts and dev-mode tests don't catch it.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-18: `lessonPracticeActionState` recomputes capability counts in two places — projection logic in the page
- **Severity:** nice-to-have
- **Category:** misplaced-logic
- **Subtype:** architecture-violation / misplaced-logic
- **Evidence:**
  - `src/pages/Lesson.tsx:125-135` — `practiceReadyCount = lessonActivated ? Math.max(0, readyCapabilityCount - activePracticedCapabilityCount) : 0`
  - `src/components/lessons/PracticeActions.tsx:51-61` — identical formula in the component
- **Recommendation:** Push this projection into `buildLessonPracticeActions` (it already exists as the single seam — `src/lib/lessons/lessonActionModel.ts`). Callers should pass raw `readyCapabilityCount + practicedCount + activated` and let the model derive `LessonPracticeActionState`. As-is, anyone fixing the formula has to find both copies.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F3-19: `Lessons.tsx` `paletteFor` does `React.ReactElement` type-cast + clones via `baseGlyph.type` — fragile React internals access
- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/pages/Lessons.tsx:77-81` — `const baseGlyph = palette.glyph as React.ReactElement<{ size?: number }>; const glyph = baseGlyph ? <baseGlyph.type {...baseGlyph.props} size={glyphSize} /> : LESSON_PALETTE_FALLBACK.glyph`
- **Recommendation:** Switch the palette to store the icon **component reference** (`glyph: typeof IconBuildingStore`) rather than a rendered element, then render it inline with the desired size: `<glyph size={glyphSize} />`. The current `baseGlyph.type` access is fine in React 19 but is the kind of code that breaks on a React major bump and the type cast hides it. Also: the `baseGlyph ?` check is always truthy because we just constructed it on line 73.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-20: ExperiencePlayer state setters (`setAnsweredBlocks`, `setSkippedBlocks`, `setCommitFailedBlocks`) all clone-and-add — pattern duplication
- **Severity:** nice-to-have
- **Category:** duplication
- **Evidence:**
  - `src/components/experience/ExperiencePlayer.tsx:145` — `setAnsweredBlocks(s => { const n = new Set(s); n.add(currentBlock.id); return n })`
  - `src/components/experience/ExperiencePlayer.tsx:147` — same shape for `setCommitFailedBlocks`
  - `src/components/experience/ExperiencePlayer.tsx:166-167` — same shape for `setAnsweredBlocks` + `setSkippedBlocks` in handleSkip
- **Recommendation:** Helper `addTo(setter)` or migrate to a single `Map<string, BlockOutcome>` keyed by blockId. The triple-Set state is just an enum-per-block in disguise.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-21: `PracticeActions` empty-state hardcodes NL string outside i18n
- **Severity:** cleanup
- **Category:** i18n-drift
- **Evidence:**
  - `src/components/lessons/PracticeActions.tsx:63-69` — `<Button variant="default" disabled fullWidth>Geen oefeningen beschikbaar</Button>`
- **Recommendation:** Route through `useT` (likely `T.lessons.noPracticeAvailable` — add the key). Same component already needs i18n treatment per F3-7.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-22: `MasteryFunnel` / `VulnerableItemsList` / `MemoryHealthHero` / `DetailedMetrics` / `ReviewForecastChart` all hardcode NL — Progress page is monolingual
- **Severity:** cleanup
- **Category:** i18n-drift
- **Evidence (sample, 5 of N):**
  - `src/components/progress/MasteryFunnel.tsx:15-18` — `'Inprenten' / 'Oproepen' / 'Productief' / 'Onderhoud'` + line 35 `'Nog geen woorden geleerd.'`
  - `src/components/progress/VulnerableItemsList.tsx:25` — `Meest Kwetsbare Woorden`; line 55 `'lapse' / 'lapses'` (also EN!) hardcoded
  - `src/components/progress/MemoryHealthHero.tsx:15-17,103-104,108,113,121,131` — `'Sterk' / 'Ontwikkelen' / 'Zwak' / 'Geheugensterkte' / 'Herkenning' / 'Oproepen' / 'KLOOF ANALYSE' / 'Je herkenning is sterk...'`
  - `src/components/progress/DetailedMetrics.tsx:70,76,90,115,125,132,147,158,177` — `'Details' / 'Gem. Stabiliteit' / 'Zwakke Woorden Gered' / 'Nauwkeurigheid' / 'MCQ' / 'Recall' / 'Reactietijd' / 's/antwoord sneller' / 'gem. reactietijd deze week'`
  - `src/components/progress/ReviewForecastChart.tsx:18,43,71,91,93,106,112,130` — `'Geen reviews gepland...' / '7-Daagse Voorspelling' / 'Vand.' / "Als je deze dag overslaat:" / "items schuiven door — backlog stijgt naar X items" / "kaarten vervallen — plan extra tijd in" / "Volgende week (als je consistent blijft)" / "Max X kaarten/dag — geen spikes"`
  - Plus `src/pages/Progress.tsx:33-34` — page title `'Geheugenoverzicht'` + subtitle `'Jouw leervoortgang en geheugengezondheid'` (not even routed through useT — see F3-23)
- **Count:** ~30 hardcoded NL strings spread across the 5 progress components + Progress.tsx
- **Recommendation:** The entire `/progress` surface is locked to Dutch even when the user's profile language is `en`. Add a `T.progress.*` bundle (some keys already exist at `i18n.ts:147+`) and route every string through `useT`. Pluralisation ("lapse" / "lapses") needs an actual lookup or ICU-style template.
- **Estimated effort:** medium
- **Cross-slice dependency:** null

### F3-23: `Progress.tsx` page title/subtitle hardcoded NL despite using PageHeader
- **Severity:** cleanup
- **Category:** i18n-drift
- **Evidence:**
  - `src/pages/Progress.tsx:33-34` — `<PageHeader title="Geheugenoverzicht" subtitle="Jouw leervoortgang en geheugengezondheid" />`
- **Recommendation:** Use `useT()` and pull from `T.progress.title` (add if missing). Same fix pattern as F3-22.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-24: Lesson reader `LessonReader.module.css` defines `.primaryButton` / `.secondaryButton` classes that are never used
- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/components/lessons/LessonReader.module.css:400-439` — `.primaryButton`, `.primaryButton:hover`, `.secondaryButton`, `.secondaryButton:hover`
  - `grep -n "primaryButton\|secondaryButton" src/components/lessons/` — only the .module.css file references them; LessonReader.tsx uses `.primaryAction` / `.secondaryAction` (lines 441-473) instead
- **Recommendation:** Delete the 4 dead button blocks. They were superseded when the actions row migrated to `.primaryAction / .secondaryAction`, but the old rules weren't cleaned up.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-25: `ExperiencePlayer` registry-miss logging is fire-once per change but logs cumulative count — noisy and misleading
- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `src/components/experience/ExperiencePlayer.tsx:82-89` — `registryMissCount = plan.blocks.filter(... !resolveExerciseComponent(...)).length`
  - `src/components/experience/ExperiencePlayer.tsx:91-99` — `useEffect(() => { if (registryMissCount > 0) logError({ ... error: new Error(`Filtered ${registryMissCount} block(s)...`) }) }, [registryMissCount])`
- **Recommendation:** The effect logs once per render where the count changes — including the very first mount when the count drops from undefined→0. Worse, the error message says "Filtered N block(s)" but doesn't include the exercise types or block ids, so the ops view can't tell what's missing. Log the *set of unmapped exercise types* once per session, not the count once per re-render.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-26: Lesson-1 bespoke `PlayButton` swallows play() errors silently — no user feedback on autoplay block
- **Severity:** nice-to-have
- **Category:** error-handling
- **Evidence:**
  - `src/pages/lessons/lesson-1/Page.tsx:42` — `void ref.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))`
  - `src/components/PlayButton.tsx:44` — same anti-pattern: `audio.play().catch(() => {})` (BUT this one doesn't update playing state on failure either — line 45 `setPlaying(true)` runs regardless)
- **Recommendation:** When autoplay is blocked by the browser (Safari, iOS) the user clicks and nothing visible happens. Surface a notification or at minimum log via `logError({ page: 'lesson-1', action: 'audio-play', error })`. Also note `PlayButton.tsx:44-45` has the inverse bug: setPlaying(true) is called *before* play() resolves, so a blocked play leaves the UI claiming it's playing.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F3-27: `lesson-1/Page.tsx` casts `section.content` to bespoke types per renderer — content.json shape is not typed
- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/pages/lessons/lesson-1/Page.tsx:58` — `const c = section.content as { intro: string; examples: Greeting[]; spelling: Spelling[] }`
  - same `as { ... }` pattern at lines 97, 124, 172, 215, 239, 263
- **Recommendation:** Generate or hand-author a `content.schema.ts` that mirrors `content.json` and import it once. Then `const sections: ContentSection[] = content.sections satisfies ContentSection[]` will validate at compile time. Today, drift between the fetch script and the renderer is undetected until runtime.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F3-28: Bespoke lesson-1 reader (`/lesson-preview/1`) and shared `LessonReader` (`/lesson/:lessonId`) live side-by-side with no glue
- **Severity:** cleanup
- **Category:** half-finished-migration
- **Evidence:**
  - `src/App.tsx:30` — `const Lesson1Bespoke = lazy(() => import('@/pages/lessons/lesson-1/Page'))`
  - `src/App.tsx:84` — bespoke is mounted at `/lesson-preview/1`, NOT `/lesson/:lessonId`
  - `src/App.tsx:27-29` — comment "Each lesson has its own composition; not served via the /lesson/:lessonId route yet — viewable at /lesson-preview/<N>."
  - `git log --oneline -n 5` shows commit `716f878 feat(lessons): bespoke lesson 1 reader page + creative direction (#72)` but no follow-up that wires lesson 1 into the production route
- **Recommendation:** Either (a) wire `/lesson/1` to render `Lesson1Bespoke` (and add a routing primitive that dispatches per `order_index`), or (b) treat the bespoke page as experimental and gate it behind a feature flag so the duplicate maintenance burden is explicit. As-is, every Lesson.tsx change must also be replicated in lesson-1/Page.tsx, or the bespoke page rots out of sync — the activation banner divergence (F3-7) is already the first symptom.
- **Estimated effort:** medium
- **Cross-slice dependency:** null

### F3-29: Progress page lacks PageHeader translation — and the file lacks a useT call at all
- **Severity:** cleanup
- **Category:** spec-drift (i18n consistency)
- **Evidence:**
  - `src/pages/Progress.tsx:1-71` — entire file has no `useT()` import or call; every string is NL
  - by contrast every other page in slice imports `useT` and routes labels through it
- **Recommendation:** Same fix as F3-22+F3-23. Listed separately so the parent agent can spot the divergence: Progress.tsx is the only page-framework-migrated page in this slice that completely skipped i18n.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

## Open questions for orchestrator

1. **Bespoke per-lesson pages — strategy.** The bespoke lesson-1 reader (F3-28) is a tracer for a per-lesson page architecture. Is the plan to fold *all* lessons onto bespoke pages (and retire `LessonReader` + the block builder), or to keep `LessonReader` as the default with bespoke pages as overrides? F3-7, F3-8, F3-14, F3-26, F3-27 all hinge on this answer.
2. **i18n cutoff.** Cluster F3-9, F3-10, F3-11, F3-21, F3-22, F3-23, F3-29 all suggest the NL→EN migration was abandoned partway. Is bilingual support still a goal, or should the `'en'` branch in i18n be deleted to stop the rot?
3. **Bug F3-1 priority.** The dashboard "Continue lesson" tile points at a URL that resolves to the lesson list, not the lesson detail. Is this a real-world regression or has the dashboard tile been silently unused? (A 5-line fix either way.)

## Coverage notes

- All files in the assigned slice were read in full. Tests in `src/__tests__/` (Lessons.test.tsx, Lesson.test.tsx, LessonReader.test.tsx, ExperiencePlayer.test.tsx, RecencyBadge.test.tsx, dashboard-redesign.test.tsx) were sampled for behaviour confirmation but not deeply audited; they live outside the slice's `src/components/.../__tests__` colocations.
- The page-framework primitive bypass count (per CLAUDE.md the target is "16 of 18 surfaces on the framework") holds in spirit — Lesson.tsx's stray `<Paper>` (F3-4) and LessonAudioPlayer's `<Paper>` (F3-5) are micro-bypasses inside otherwise-migrated pages, not whole-page bypasses. The 2 intentionally-excluded surfaces (AdminGuard, DesignLab) are agent 4's slice.
- ADR 0005 (lesson reader stays passive) was respected — `LessonReader.tsx`, `LessonBlockRenderer.tsx` emit no writes. The only mutation in the lesson-reader surface is the activation checkbox, which writes via `setLessonActivated` (the explicit owner-state RPC). That is consistent with the ADR.
- Capability barrel: no UI file in the slice imports from `@/lib/capabilities/capabilityCatalog` or other internals — all go through services. No subtype `bypassed-barrel` findings.
- Direct Supabase from components/pages: none in slice — every data access goes through `lessonService`, `learnerProgressService`, `learnerStateService`, or `lessonService.getAudioUrl`. No subtype `direct-supabase-from-ui` findings.
