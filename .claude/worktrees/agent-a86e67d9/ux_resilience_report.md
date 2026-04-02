# UX Resilience Audit — learning-indonesian

**Date:** 2026-03-20
**Scope:** All files under `src/` — pages, components, stores, services, lib

---

## Summary

The codebase is generally well-structured. Error handling is consistently present across all async operations (Supabase calls, auth, progress saves). Loading and empty states are mostly covered. The main gaps are around silent failures in a few critical paths, hardcoded "stub" content in the Dashboard, a missing no-route fallback, and several accessibility shortcomings on interactive controls.

---

## Findings

---

## [CRITICAL] Dashboard "Continue Learning" card shows hardcoded stub data

- **What:** The "Continue where you left off" card in the Dashboard renders hardcoded text: `Les 1 — Di Pasar`, `Section 3 of 5 · Grammar`, and a fixed `60%` progress bar. This is never connected to real user lesson progress.
- **Where:** `src/pages/Dashboard.tsx:114–124`
- **Impact:** A user who has completed zero lessons, or who is on lesson 2, section 5, sees a card claiming they are at lesson 1 section 3 with 60% progress. This is actively misleading. The day streak stat (hardcoded `7` at line 102) has the same problem — every user always sees "7 day streak" regardless of their actual streak.
- **Fix:** Either derive the "continue" card from real `lesson_progress` data (which is already fetched in the effect at line 35), or hide the card until the data layer supports it and replace it with a neutral prompt. Replace the hardcoded streak `7` with a real value or remove the stat card until the data model tracks streaks. The `nextDueIn2Hours` sub-label on the Cards Due stat is also hardcoded text — it should either be computed or removed.

---

## [CRITICAL] Set detail page: "Add Card" button is a no-op

- **What:** The "Add Card" button (`<Button leftSection={<IconPlus size={16} />} variant="outline">{T.sets.addCard}</Button>`) on the Set detail page has no `onClick` handler. Clicking it does nothing.
- **Where:** `src/pages/Set.tsx:147`
- **Impact:** Owners of private or shared sets who want to add cards to their own deck encounter a completely broken flow. The button looks interactive, but nothing happens. No error, no dialog, no navigation — silent failure.
- **Fix:** Either implement the add-card flow (modal with front/back inputs calling a `createCard` service method), or hide the button behind a `disabled` state with a tooltip explaining the feature is coming. Do not leave a dead call-to-action visible.

---

## [CRITICAL] ShareCardSetModal: failed `fetchShares` is silently swallowed

- **What:** The `fetchShares` function in `ShareCardSetModal` catches errors but only calls `logError` — it never shows a notification to the user and leaves the shares list empty with no indication of failure.
- **Where:** `src/components/ShareCardSetModal.tsx:25–35`
- **Impact:** If the Supabase call to load existing shares fails (e.g. network error, RLS issue), the user sees an empty "Shared with:" list and has no way to know whether the set has no shares or whether loading failed. They may accidentally re-share with people who already have access, or believe the set is unshared when it is not.
- **Fix:** Add a `notifications.show({ color: 'red', ... })` inside the catch block, matching the pattern used by `handleShare` and `handleUnshare` in the same file.

---

## [HIGH] Lesson page: progress save failure does not block navigation

- **What:** In `handleNext`, if `progressService.markLessonComplete` throws, the error is shown in a notification but the code continues — `setCurrentSectionIndex` is incremented (or the user is navigated away to `/lessons`) regardless of whether the save succeeded.
- **Where:** `src/pages/Lesson.tsx:217–244`
- **Impact:** The user sees an error toast but is moved forward anyway. Their progress is not actually saved for that section. On next visit the section appears incomplete. For the final section specifically, the user is navigated to `/lessons` even if the completion save failed — they will see the lesson as not completed.
- **Fix:** Move `setCurrentSectionIndex` and `navigate('/lessons')` inside the `try` block, after the `await`. If the save fails, keep the user on the current section so they can retry.

---

## [HIGH] Review page: card index advances even when `updateCardReview` fails

- **What:** In `handleRating`, if `cardService.updateCardReview` throws, the catch block shows a notification and `setSubmitting(false)` — but `currentIndex` and `reviewedCount` have already been incremented before the `try/catch` in earlier versions. Checking the current code: the increments happen *inside* the try block, so on failure neither counter advances. However `setSessionDone(true)` could also be called — let me note the actual risk: if the Supabase call fails at the last card, `setSessionDone(true)` is not reached, but `currentIndex` is not advanced either. The submitting guard prevents double-clicking. This path is actually acceptable. **The real HIGH issue here is that if `startSession` fails during `init()`, `sessionIdRef.current` remains `null` and no session is tracked, but `fetchDueCards` may still succeed — the user can complete a full review session with zero session analytics.**
- **Where:** `src/pages/Review.tsx:38–53`
- **Impact:** If `startSession` throws (e.g. DB insert fails), the catch shows a generic error. But because `Promise.all` is used, `fetchDueCards` is also cancelled — the user sees the error then an empty card queue, even if they have cards to review. A partial failure in `Promise.all` aborts both tasks.
- **Fix:** Separate the two concerns. Start the session and fetch due cards independently so a session tracking failure does not prevent the user from reviewing their cards.

---

## [HIGH] Lesson page: no error state when lesson fails to load

- **What:** If `lessonService.getLesson` throws, the catch shows a notification and `setLoading(false)` is called. `lesson` remains `null`. The render guard `if (loading || !lesson)` then returns a `<Loader>` — but `loading` is now `false` and `lesson` is `null`, so the condition `!lesson` is `true` and the user sees an infinite spinner even though loading has completed.
- **Where:** `src/pages/Lesson.tsx:287`
- **Impact:** After a failed lesson fetch, the user sees a loader that never resolves, with no way to navigate back or retry. The error notification auto-dismisses and leaves the page in a broken non-interactive state.
- **Fix:** Add a separate `error` state. When `error` is true and `lesson` is null, render an error message with a "Back to lessons" link instead of the loader.

---

## [HIGH] Podcast detail page: same infinite-loader bug on fetch failure

- **What:** Same issue as the Lesson page. If `podcastService.getPodcast` throws, `setLoading(false)` is called but `podcast` stays `null`. The guard `if (loading || !podcast)` returns `<Loader>` forever.
- **Where:** `src/pages/Podcast.tsx:51`
- **Impact:** Same as above — user is stuck on a spinner after an error. They cannot navigate back without using the browser button.
- **Fix:** Same pattern: add an `error` state, render a message + back-link when the fetch fails.

---

## [HIGH] Set detail page: same infinite-loader bug on fetch failure

- **What:** If `cardService.getCardSets()` or `cardService.getCards()` throws, `setLoading(false)` is called but `set` remains `null`. The guard `if (loading || !set)` returns `<Loader>` forever after the error notification dismisses.
- **Where:** `src/pages/Set.tsx:79`
- **Impact:** User is stuck on spinner. Cannot navigate back without using the browser button.
- **Fix:** Add an `error` state and render a back-navigation + message when `error` is true.

---

## [HIGH] No 404 / catch-all route

- **What:** `App.tsx` defines no `<Route path="*">` fallback. Navigating to any unknown path (e.g. `/typo`, a stale deep-link) renders nothing — the `<Layout>` renders with an empty `<main>` and no content, no error, no redirect.
- **Where:** `src/App.tsx`
- **Impact:** Users who bookmark a deleted set URL, follow a broken link, or mistype a URL see a completely blank page with no indication of what happened and no way forward except using the browser back button.
- **Fix:** Add a `<Route path="*" element={<Navigate to="/" replace />} />` inside the Layout routes, or a dedicated `NotFound` component that explains the page doesn't exist and links back to the dashboard.

---

## [HIGH] Practice page: exact-match only, no partial credit or guidance

- **What:** The practice answer check is `user_answer === correct_answer` after `.trim().toLowerCase()`. Answers like "I" vs "me", punctuation differences, or minor spelling variations are always marked wrong with no hint to the user about why.
- **Where:** `src/pages/Practice.tsx:100–103`
- **Impact:** A user who types "market" for "pasar" when the stored English is "the market" is marked incorrect. The error message immediately reveals the answer, which may be discouraging but more importantly does not explain what the expected format is (e.g. whether articles are required).
- **Fix:** Consider normalising punctuation/articles, or show the expected format in the prompt (e.g. "include/exclude the article"). At minimum, mention in the UI that exact matching is required.

---

## [MEDIUM] Profile page: display name has no length validation

- **What:** The `TextInput` for display name has no `maxLength`, no client-side validation, and the save button is enabled immediately. An empty string clears the name to `null` (handled server-side), but a 10,000-character string will be sent to Supabase.
- **Where:** `src/pages/Profile.tsx:150–155`
- **Impact:** A database constraint will reject an excessively long name, but the error message will be the generic "Something went wrong" toast rather than a helpful prompt. The form also has no disabled/loading state while the old save is in-flight that prevents re-clicking during the save.
- **Fix:** Add `maxLength={80}` to the `TextInput` and a client-side validation check before calling `handleSave`. The `Button` already uses `loading={saving}` which prevents double-submit — this is correctly handled.

---

## [MEDIUM] Sets page: "Create Set" modal does not close on backdrop click during creation

- **What:** When `creating` is true the submit button is disabled, but the modal itself remains closeable via the X button or backdrop click. If the user closes it mid-request, the `setModalOpened(false)` call fires, and on success `setModalOpened(false)` and `form.reset()` are called again on an already-closed modal — harmless but also the set gets created silently with no feedback visible.
- **Where:** `src/pages/Sets.tsx:88`
- **Impact:** Low-probability edge case. The set is still created and will appear in the list after the background request completes, but the user may not understand why a new set appeared.
- **Fix:** Pass `closeOnClickOutside={false}` and `closeOnEscape={false}` to `<Modal>` while `creating` is true, or set `<Modal closeOnClickOutside={!creating} closeOnEscape={!creating}>`.

---

## [MEDIUM] Leaderboard: stale data shown while loading a new tab

- **What:** When the user switches to a different tab, `setLoading(true)` is called but `entries` is not cleared. The old tab's data remains visible behind the `<Loader>` component only if the tab panel is the active one — but because each `<Tabs.Panel>` renders `{loading ? <Loader> : renderTable()}`, switching tabs shows the previous entries briefly before the loader replaces them only when `loading` becomes true. Actually because `loading` is set first, the loader shows immediately. The real issue is that the `noEntries` empty state check at line 119 sits outside the `<Tabs>` component and therefore flickers: if the new tab returns empty results, the "no entries" message appears below the tabs alongside the selected tab's empty-but-rendered table.
- **Where:** `src/pages/Leaderboard.tsx:119–123`
- **Impact:** The empty-state message can appear below the tabs panel while the table for that tab is also rendered (both showing simultaneously), creating a confusing double-render.
- **Fix:** Move the `entries.length === 0` check inside `renderTable()` so it is controlled by which panel is active, or clear `entries` with `setEntries([])` at the start of the `fetchData` effect before the new request.

---

## [MEDIUM] Review page: rating buttons show hardcoded interval labels

- **What:** The "Again / Hard / Good / Easy" rating buttons show hardcoded sub-labels: `< 1m`, `2d`, `4d`, `7d`. These are not derived from the SM-2 calculation result for the current card — they are fixed strings regardless of the card's actual repetition count or easiness factor.
- **Where:** `src/pages/Review.tsx:187–200`
- **Impact:** A card that has been reviewed 10 times with "Easy" every time will still show "Easy → 7d", even though the actual next interval will be much longer. The user cannot make an informed rating decision.
- **Fix:** Compute the projected next interval for each rating quality (again/hard/good/easy) using `calculateNextReview` on the current card and display the real value (e.g. "14d", "21d").

---

## [MEDIUM] Lesson page: audio player play/pause state desyncs from actual audio state

- **What:** `togglePlay` sets `setIsPlaying(!isPlaying)` based on local state, not on `audioRef.current.paused`. If the audio ends, `onEnded` fires and sets `isPlaying(false)`. But if the user presses play on the `<audio>` element directly (native controls are hidden so this is moot), or if `audioRef.current.play()` throws (e.g. autoplay policy), the state becomes incorrect.
- **Where:** `src/pages/Lesson.tsx:254–262`
- **Impact:** The play/pause icon can show the wrong state. More importantly, `audioRef.current.play()` returns a Promise that can be rejected (e.g. by the browser's autoplay policy on first visit). That rejection is unhandled — no catch block — which will produce an unhandled Promise rejection in the console and a silent failure on some browsers.
- **Fix:** Handle the promise returned by `audioRef.current.play()`: `.catch(() => setIsPlaying(false))`. Also derive `isPlaying` from `onPlay`/`onPause` audio events rather than toggling local state.

---

## [MEDIUM] ShareCardSetModal: search results use display name as the identifier

- **What:** `onOptionSubmit` in the `Autocomplete` passes `item` which is the option's `value` string (the display name), not the profile object. The `handleShare` function receives this as `profile: { id: string, value: string }`, but the `id` in that type is never populated from `onOptionSubmit` — `item` is the `value` string only.
- **Where:** `src/components/ShareCardSetModal.tsx:99`
- **Impact:** `handleShare` calls `cardService.shareCardSet(setId, profile.id)` where `profile.id` will be `undefined` because `onOptionSubmit` only passes the string value. This means sharing will silently insert a row with `shared_with_user_id = undefined`, which either fails with a Supabase error (caught and shown to user) or inserts a null. The flow is functionally broken for actually sharing sets.
- **Fix:** The Mantine `Autocomplete` `onOptionSubmit` callback receives the `value` string, not the full data object. To get the `id`, look it up from `searchResults` by matching the submitted value: `const profile = searchResults.find(r => r.value === item)`.

---

## [MEDIUM] Practice page: no keyboard shortcut to advance after correct answer

- **What:** After submitting an answer, pressing Enter while the input is focused correctly moves to the next question via the `onKeyDown` handler. However, focus is moved to the "Next" button on render — the user must press Tab then Enter or click. Actually the `onKeyDown` on the input does handle Enter-when-submitted to call `handleNext`, but the input is `disabled={submitted}`, so keyboard focus naturally moves away. The "Next" button does not autofocus.
- **Where:** `src/pages/Practice.tsx:164–167`
- **Impact:** After submitting, keyboard-only users must Tab to the Next button before continuing, which slows the practice flow.
- **Fix:** Add `autoFocus` to the "Next" button that replaces "Check Answer" after submission, or programmatically focus it.

---

## [LOW] Dashboard: "Continue Learning" progress section link is hardcoded

- **What:** The `continueSection` links to `/lessons` regardless of where the user actually is. The lesson title and section are hardcoded strings (see CRITICAL finding above), but even if that's fixed, a user who clicks the card is taken to the lesson list, not to the specific lesson.
- **Where:** `src/pages/Dashboard.tsx:109`
- **Impact:** Extra navigation step — the user must find and click the correct lesson again.
- **Fix:** Link directly to `/lesson/:lessonId` once real data drives this card.

---

## [LOW] Sidebar pin button has no ARIA label

- **What:** The pin button in the Sidebar uses a `title` attribute (`"Lock sidebar"` / `"Unlock sidebar"`) but no `aria-label`. The `title` attribute is not reliably surfaced by all screen readers.
- **Where:** `src/components/Sidebar.tsx:53–58`
- **Impact:** Screen reader users may not know the button's purpose.
- **Fix:** Add `aria-label={locked ? 'Unlock sidebar' : 'Lock sidebar'}` to the pin button, matching the existing `title` value.

---

## [LOW] Theme toggle button has no ARIA label

- **What:** The theme toggle button in the Sidebar footer uses `title="Toggle theme"` but no `aria-label`.
- **Where:** `src/components/Sidebar.tsx:85–91`
- **Impact:** Screen reader users get no semantic label for this button.
- **Fix:** Add `aria-label={colorScheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}`.

---

## [LOW] Audio player control buttons have no ARIA labels

- **What:** The audio play/pause button, speed cycle button, volume mute/unmute button, and download link in `Lesson.tsx` all have no `aria-label` attributes. Their only content is an icon.
- **Where:** `src/pages/Lesson.tsx:321–332, 342`
- **Impact:** Screen reader users cannot identify the purpose of these controls. The speed button shows "1x" as text which is somewhat self-describing, but play/pause and volume have no labels at all.
- **Fix:** Add `aria-label` to each audio control button: `"Play"` / `"Pause"`, `"Mute"` / `"Unmute"`, and `"Download audio"` on the anchor.

---

## [LOW] Review card: no `role` or ARIA attributes on the flip card

- **What:** The flashcard flip container (`div.cardContainer` → `div.cardInner`) is a `<div>` with no interactive semantics. The "Show Answer" button correctly has button semantics, but there is no indication to assistive technology that the card has a front and back, or that the state has changed when flipped.
- **Where:** `src/pages/Review.tsx:161–176`
- **Impact:** Screen readers will read the front and back card text simultaneously (both are in the DOM via `position: absolute`). A visually-impaired user cannot distinguish which side they are seeing.
- **Fix:** Use `aria-hidden` to hide the back face when the card is not flipped, and hide the front face when it is. Or use `aria-live="polite"` on the displayed content region so flipping announces the new content.

---

## [LOW] Profile page: `TextInput` label and `aria-label` are duplicated

- **What:** The display name `TextInput` has both `label={T.profile.displayName}` (which Mantine renders as a `<label>` element) and the field effectively has the same text as its placeholder. This is fine, but there is a subtle issue: the form has no `onSubmit` handler — saving requires clicking the `Button` (or using Enter in the field, which is not wired). The `Button` is not inside a `<form>` element.
- **Where:** `src/pages/Profile.tsx:147–161`
- **Impact:** Pressing Enter in the display name field does not save. This is non-standard form behaviour that keyboard users will expect to work.
- **Fix:** Wrap the display name section in a `<form onSubmit={...}>` and make the button `type="submit"`, or add an `onKeyDown` Enter handler to the `TextInput`.

---

## [LOW] Responsive layout: sidebar `paddingLeft: 64` on mobile is too large

- **What:** When the sidebar is in overlay mode (not locked), the main content area has `paddingLeft: 64` (to accommodate the hamburger button). On small screens this takes significant horizontal space and is asymmetric with `paddingRight: 24`.
- **Where:** `src/components/Layout.tsx:84`
- **Impact:** On narrow screens (< 400px), content feels cramped and offset. The hamburger button itself is 36×36px with a 14px top/left offset — the 64px left padding is generous but adds layout asymmetry.
- **Fix:** Consider reducing to `paddingLeft: 54` or using a responsive value, and ensure the hamburger overlap area is handled via the hamburger's own positioned context rather than content padding.

---

## [LOW] `phraseDutch` text has `white-space: nowrap` — overflows on small screens

- **What:** `.phraseDutch` in `Lesson.module.css` sets `white-space: nowrap`. In the phrase grid (2-column layout), long Dutch translations will overflow their column on small viewports rather than wrapping.
- **Where:** `src/pages/Lesson.module.css:283`
- **Impact:** On narrow screens, Dutch translations in vocabulary/exercise sections may be clipped or cause horizontal scroll on the phrase card.
- **Fix:** Remove `white-space: nowrap` and rely on the `overflow: hidden` of the parent `.contentCard` for truncation, or switch to `text-overflow: ellipsis` if truncation is desired.

---

## [LOW] `src/assets/hero.png` — not audited for alt text

- **What:** There is a `hero.png` in `src/assets/` that is not referenced anywhere in the audited source files. If it is used in a future or unaudited component, ensure it has appropriate `alt` text.
- **Where:** `src/assets/hero.png`
- **Impact:** N/A currently — file appears unused.
- **Fix:** If the image is deployed, ensure it is wrapped with `<img alt="...">` with a meaningful description, or `alt=""` if purely decorative.

---

## Coverage Summary

| Category | Issues found | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|---|
| Error Handling | 4 | 1 | 3 | 0 | 0 |
| Form & Input Resilience | 4 | 1 | 0 | 2 | 1 |
| State Gaps | 5 | 1 | 3 | 1 | 0 |
| Accessibility | 5 | 0 | 0 | 0 | 5 |
| Responsive & Layout | 2 | 0 | 0 | 0 | 2 |
| **Total** | **20** | **3** | **6** | **3** | **8** |
