# Production Readiness Report

**Date:** 2026-03-20
**App:** learning-indonesian
**Scale Target:** Tier 1 — Personal (1–5 users, homelab)
**Verdict:** ❌ NOT READY — 3 critical UX blockers must be resolved before real users

---

## Summary

| Domain | Critical | High | Medium | Low |
|--------|----------|------|--------|-----|
| [SECURITY] | 0 | 0 | 3 | 4 |
| [UX] | 3 | 6 | 3 | 8 |
| [SCALING] | 0 | 0 | 0 | 6 |
| **Total** | **3** | **6** | **6** | **18** |

---

## Critical Blockers (fix before shipping)

### [UX] Dashboard shows hardcoded stub data
- **What:** The "Continue Learning" card, day streak (`7`), and "next due in 2 hours" label are hardcoded constants — not real user data. Every user sees the same misleading values.
- **Impact:** Users cannot trust the dashboard. Streak tracking is a core feature that appears broken immediately on login.
- **Fix:** Wire the dashboard to real `user_progress` data from Supabase.

### [UX] "Add Card" button is a dead no-op
- **What:** The "Add Card" button on Set detail pages has no click handler. It renders, looks clickable, and does nothing.
- **Impact:** The core card-creation flow is completely broken — users cannot add cards to a set.
- **Fix:** Implement the Add Card handler or remove the button until the feature is ready.

### [UX] ShareCardSetModal silently swallows fetch errors
- **What:** If loading the existing shares list fails, the user sees an empty list with no feedback or error message.
- **Impact:** Silent failure leaves users confused about whether the set is shared or not. They may re-share or assume sharing is broken.
- **Fix:** Catch the error and show a Mantine notification. Display an error state in the modal instead of an empty list.

---

## High Priority

### [UX] Lesson progress save failure doesn't block navigation
- **What:** If saving section progress to Supabase fails, the user is still moved to the next section, silently losing progress.
- **Fix:** Await the save before advancing, or show an error and give the user the option to retry.

### [UX] Review session: `startSession` + `fetchDueCards` in the same `Promise.all`
- **What:** If session tracking fails, it cancels the entire card fetch — the user can't do a review at all.
- **Fix:** Separate concerns. Fetch due cards independently; let session tracking fail gracefully in the background.

### [UX] Infinite spinner after fetch failure (3 pages)
- **What:** Lesson, Podcast detail, and Set detail pages all have the pattern `if (loading || !lesson)` — after a failed fetch, `loading` is false but the entity is null, so the spinner renders forever with no error message.
- **Where:** `src/pages/Lesson.tsx`, `src/pages/Podcast.tsx`, `src/pages/Set.tsx`
- **Fix:** Add an explicit error state. When `!loading && !entity`, render an error message with a retry option instead of the spinner.

### [UX] No 404 / catch-all route
- **What:** Unknown URLs render a completely blank page.
- **Fix:** Add a `<Route path="*">` catch-all that renders a 404 page with a link back to the dashboard.

---

## Medium Priority

### [SECURITY] Missing HTTP security headers
- **What:** `nginx.conf` has no security headers — no CSP, no `X-Frame-Options`, no `X-Content-Type-Options`, no `Referrer-Policy`.
- **Fix:** Add a header block to `nginx.conf`. Highest-value single fix in the security domain:
  ```nginx
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Content-Security-Policy "default-src 'self'; connect-src 'self' https://api.supabase.duin.home; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;" always;
  ```

### [SECURITY] Open redirect risk in `ProtectedRoute`
- **What:** `ProtectedRoute` passes `window.location.href` (full URL + query string) as the `next` param to `auth.duin.home`. A crafted link could redirect users post-login to an attacker-controlled page if `auth.duin.home` doesn't validate `next` against a `*.duin.home` allowlist.
- **Fix:** Validate the `next` parameter on the auth portal. On the client, consider passing only the path (not full origin) or a whitelisted set of destinations.

### [SECURITY] RLS policies unverified
- **What:** Card set mutations (`updateCardSetVisibility`, `shareCardSet`, `unshareCardSet`) rely entirely on Supabase RLS for ownership enforcement. The client-side `set.owner_id !== user.id` check in `Set.tsx` is UI-only and trivially bypassed. RLS correctness could not be verified from source code alone.
- **Fix:** Run `make check-supabase-deep` to verify RLS policies are in place. Document the expected policies in `scripts/migration.sql` comments.

### [UX] Broken share flow — `profile.id` is always `undefined`
- **What:** `onOptionSubmit` passes the display name string, not the profile object, so `shareCardSet` always receives `profile.id = undefined`.
- **Fix:** Fix the `onOptionSubmit` handler to pass the profile object (or just the ID) instead of the display string.

### [UX] Hardcoded SM-2 interval labels on review rating buttons
- **What:** Interval labels ("2d", "4d", etc.) on the rating buttons are hardcoded, not computed from the SM-2 algorithm for the current card state.
- **Fix:** Compute and display the actual projected next-review date for each rating option.

---

## Low Priority

### [SECURITY] `postgres` package in `dependencies` instead of `devDependencies`
- Not in the browser bundle, but misleadingly listed as a runtime dep. Move to `devDependencies`.

### [SECURITY] Google Fonts loaded from external CDN
- Minor privacy/availability concern for a homelab. Self-hosting fonts would give full offline capability and a simpler CSP.

### [SCALING] `Set.tsx` fetches all card sets to find one
- Calls `getCardSets()` then `.find()` client-side. Add a `getCardSet(id)` direct query.

### [SCALING] `getLessons()` over-fetches section JSONB blobs
- The lesson list only needs `title` + section count. Exclude `sections` from the list query.

### [SCALING] Missing indexes on `card_reviews`
- Add `CREATE INDEX IF NOT EXISTS` on `user_id` and `next_review_at` to `migration.sql`. Trivial to add before the card library grows.

### [SCALING] Leaderboard re-fetches on every tab switch
- No client-side caching between tabs. Add a short TTL cache or fetch once per mount.

### [UX] Multiple missing ARIA labels
- Hamburger menu, pin button, theme toggle, audio controls, and flashcard flip lack accessible labels.
- **Where:** `src/components/AppLayout.tsx`, `src/pages/Review.tsx`, podcast player

### [UX] Profile form missing Enter-to-submit

---

## Detailed Reports

| Report | Path |
|--------|------|
| Security | `apex_hunter_report.md` |
| UX Resilience | `ux_resilience_report.md` |
| Scaling | `scaling_check_report.md` |

---

## Recommended Fix Order

1. **Add Card handler** — core feature is broken, fix immediately
2. **Dashboard stub data** — misleads users from first login
3. **ShareCardSetModal error handling** — silent failure in a visible flow
4. **Infinite spinner on 3 pages** — all have the same 2-line fix
5. **Review Promise.all separation** — prevents review sessions from being blocked by telemetry failures
6. **Lesson progress navigation guard** — prevents silent data loss
7. **404 catch-all route** — one `<Route>` line
8. **nginx security headers** — one header block, highest security ROI
9. **RLS policy verification** — `make check-supabase-deep`, document in migration.sql
10. **Share flow `profile.id` bug** — broken feature, straightforward fix
