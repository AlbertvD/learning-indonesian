---
status: draft
reviewed_by: []
---

# Onboarding goal questions

Brainstormed with the owner 2026-08-06. Four skippable questions in the
first-run flow that personalise what a new learner actually practises, validate
the personas in `docs/marketing/personas.md`, and give the first-party channel
attribution `docs/marketing/channels.md` says is missing.

**Baseline is out of scope — it already exists.** `/instaptoets` is an adaptive
staircase over the frequency bands that writes through `apply_placement_result`,
abandon-safe and skippable. This design routes people *to* it; it does not
replace it.

---

## 1. The bug this fixes on the way past

`Register.tsx:57` navigates to `/welkom` after email signup. `signInWithGoogle`
redirects to `/login` and from there to the dashboard. **So a Google signup never
sees `/welkom`** — it skips the loanword reveal, which is the product's strongest
hook and the entire point of the day-one flow (Bet-1, ADR 0026).

Any design that hangs onboarding off a `navigate()` at one call site repeats this
bug. The trigger must be state on the profile, checked wherever the learner
lands, so it fires regardless of how the account was created.

## 2. The questions, and what each one actually changes

The governing rule: **every question must change something the learner
experiences.** A question that only records an answer is a survey wearing an
onboarding costume. Each of these maps to a lever that already exists.

| # | Question (NL) | Lever | Effect |
|---|---|---|---|
| 1 | Heb je eerder Indonesisch geleerd? | `/instaptoets` | Yes → placement probe sets the starting band. No → straight on. |
| 2 | Woordenlijsten of de hele taal? | collection vs lesson activation | Two genuinely different products: drill `top-300`/`food-drink`, or activate lesson 1 and get grammar, dialogues and capabilities. |
| 3 | Ook spreektaal, of alleen formeel? | `spreektaal_enabled` | `spreektaalFilter.ts` strips every `register='informal'` capability from sessions. Real scheduling change, not a display toggle. |
| 4 | Hoe hoorde je van ons? *(optional)* | — | Nothing for the learner. The only selfish question; see §4. |

Question 2 is the strongest and was the owner's, not the agent's. Collections and
lessons are independent activation scopes, so "I want 300 useful words before my
trip" and "I want to actually speak with my in-laws" are already two different
products — this just asks which one someone came for.

### What is deliberately NOT asked

**"Why are you learning?"** with family/travel/heritage answers. It reads well and
maps onto the personas, but it cannot change anything the product does — there is
no heritage curriculum and no travel curriculum. Asking it would promise a path
that does not exist. Persona validation comes from the *combination* of answers
2–4 instead, which is honest because each of those has an independent product
reason to be asked.

## 3. Order and friction

Four screens land at the highest-drop-off moment in the funnel. Mitigations,
following the existing onboarding's own discipline (`Welkom.tsx`,
`Instaptoets.tsx` — "skippable at every step", "nothing written until the final
call"):

- Every question skippable, with a sensible default applied on skip.
- Nothing written until the flow completes or is explicitly skipped — an
  abandoned onboarding leaves no partial state.
- The loanword wall stays FIRST. A heritage learner sees words she already knows
  before she is asked anything. Recognition earns the right to ask.
- Question 4 goes last, for the same reason: the first three have delivered
  something by then.

## 4. The attribution question

`channels.md` records that every channel conclusion is currently unfalsifiable —
there is no attribution anywhere, and there cannot be conventional analytics,
because `/privacy` §4 commits to exactly one cookie and no tracking tools, a claim
now pinned by a test.

A question at signup is first-party by construction: no cookie, no consent
banner, no contradiction. It is also the only way to learn whether the heritage
community actually outperforms search, which is the central bet of the channel
plan.

⚠️ It must be asked in the FIRST-RUN FLOW, not in the registration form. The form
does not exist for Google signups, so form-based attribution would silently
measure "how email-form users heard about us" — a skew invisible in the data.

## 5. Non-goals

- **A spreektaal-only collection.** Parked 2026-08-06 by owner decision, and the
  reason is worth preserving: every `register='informal'` capability carries a
  prerequisite on its formal twin (`cepet` requires `cepat`), so a slang-only
  collection would be full of locked capabilities and schedule empty. The
  workable shape is a 132-item register-PAIR collection — but for it to be
  practisable while `spreektaal_enabled` is false, `spreektaalFilter.ts` would
  have to become scope-aware ("off generally, on for this collection"). That is
  session-builder logic adjacent to a parity-locked RPC, not a `.theme.json`.
  Not cheap. Revisit deliberately.
- **A product tour.** `FirstRunChecklist` already does discovery-by-doing in the
  dashboard hero. A tour would be a second mechanism for the same need.
- **Replacing `/instaptoets`.** It works; this routes to it.

## 6. Supabase Requirements

### Schema changes

Two columns on `indonesian.profiles` (LEARNER DATA — gated migration, additive
only, no rewrite):

- `onboarding_completed_at timestamptz` — null means the first-run flow has not
  run. This is the trigger that makes onboarding fire for Google signups.
- `spreektaal_enabled boolean not null default true` — **moves an existing
  preference out of localStorage** (`src/lib/spreektaalPreferences.ts`). Today the
  answer is device-local: set it on a laptop, open the app on a phone, and it is
  silently back to the default. An answer given during onboarding must persist.
- `signup_source text` — free text, nullable. Attribution. Deliberately not an
  enum: the useful answers are the ones we did not anticipate, and a CHECK
  constraint here would reject exactly those.

RLS: `profiles` already has owner-read/owner-write policies; these columns
inherit them. No new policies.

Grants: none — `authenticated` already has the row-level access it needs.

Migration must be additive-then-read: ship the columns, have the client fall back
to localStorage while `spreektaal_enabled` is null, then remove the fallback in a
later change. Never a destructive rewrite of a learner table.

### homelab-configs changes

- [ ] PostgREST schema exposure — N/A, `indonesian` already exposed
- [ ] Kong CORS — N/A, no new origins
- [ ] GoTrue — N/A, no auth config change
- [ ] Storage buckets — N/A

### Health check additions

- `check-supabase-deep.ts`: assert the three columns exist with the stated types
  and defaults, and that `spreektaal_enabled` is `not null`.
- No tier-1 (anon) check — these are owner-scoped profile columns.

## 7. Open questions for review

1. On skip of question 2, what is the default — activate lesson 1 (the full
   course) or `nl-leenwoorden` (what `/welkom` does today)? The current flow
   implies the latter; the safer product answer may be the former.
2. Should `onboarding_completed_at` backfill as `now()` for existing accounts, so
   the handful of current users are not shown onboarding retroactively? Probably
   yes, and it is a one-line data migration.
3. Does question 2's "word lists" branch show all 12 collections, or a curated
   three? Twelve is a wall; three is a choice.
