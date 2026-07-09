---
module: mnemonics
surface: src/lib/mnemonics/
last_verified_against_code: 2026-07-09
status: in-flight   # lib/mnemonics + MnemonicWorkshop shipped in this PR; host wiring
                     # (Session.tsx / ExperiencePlayer.tsx / StubbornWordsCard.tsx) applied
                     # by the orchestrating agent — see PR for the exact commit.
                     # 2026-07-09 (home-mnemonic-weak-words-surface slice 1):
                     # MnemonicWordChips extracted as the shared chip/dot/workshop
                     # body; StubbornWordsCard refactored to consume it;
                     # TroublesomeWordsSheet (Home) added as a second consumer.
---

# `lib/mnemonics` — the stubborn-word mnemonic workshop

The domain module behind the learner-authored memory-hook feature
(`docs/plans/2026-07-05-stubborn-word-mnemonic-workshop.md`): one free-text association
note per `(learner, source_ref)`, decided-when-to-surface by a pure function, persisted
by a thin Supabase adapter. It is a **hexagonal deep module** (target-arch Rule #2) — the
two-tier resurface/offer/none decision and the `isStubborn` reuse are the non-trivial
logic that clears the promotion bar; the public port (`index.ts`) is 6 symbols.

## 1. Public interface

Consumers (the neutral `components/mnemonics/MnemonicWorkshop`, `pages/Session.tsx`,
`components/experience/ExperiencePlayer.tsx`, `components/progress/StubbornWordsCard.tsx`)
import only `index.ts`:

| Export | Signature | Purpose |
|---|---|---|
| `resolveMnemonicAffordance` | `(input) → MnemonicAffordance` | the one decision (`affordance.ts`) |
| `fetchMnemonic` | `(userId, sourceRef) → Promise<Mnemonic \| null>` | single-word read (workshop's own fetch-on-open) |
| `fetchMnemonicsForRefs` | `(userId, sourceRefs[]) → Promise<Map<sourceRef, note>>` | batch prefetch (host-owned, mirrors `audioMap`) |
| `upsertMnemonic` | `(userId, sourceRef, note) → Promise<Mnemonic>` | create/edit |
| `deleteMnemonic` | `(userId, sourceRef) → Promise<void>` | remove (exposed; no v1 UI wires it yet) |
| types | `Mnemonic`, `MnemonicAffordance` | re-exported from `model.ts` |

## 2. Internal flow (functional, not stepwise)

**The feedback-screen decision** (`affordance.ts` `resolveMnemonicAffordance`) — pure,
evaluated only on a `wrong` outcome (a correct answer always yields `{kind:'none'}`,
which is also the entire "disappearance rule" — no timer, no flag, see design §6):

1. word has a saved note → `{kind:'resurface', note}` — always wins, regardless of
   which capability of the word just failed or how many times.
2. no note, and `isStubborn(evidence)` (reused from
   `@/lib/analytics/mastery/masteryModel`, not re-derived) → `{kind:'offer',
   tier:'prominent', sourceRef, failureCount}` — the full reframe card.
3. no note, `evidence.consecutiveFailureCount >= 1` (an earlier miss, or a lapsed
   word not yet re-flagged stubborn) → `{kind:'offer', tier:'quiet', sourceRef}`.
4. otherwise (a fresh, never-failed-before miss) → `{kind:'none'}`.

`evidence` is the block's **build-time** `CapabilityScheduleSnapshot`
(`capabilityReviewProcessor.ts:12-24`) — it does not include the just-failed
in-session attempt (design §6 note (b)); this is accepted lag, not a bug.

**The host prefetch** (`Session.tsx`, mirrors `audioMap`) calls
`fetchMnemonicsForRefs(userId, sourceRefs)` once per session for every block's
`renderPlan.sourceRef`, and passes the resulting `Map<sourceRef, note>` down.
`ExperiencePlayer` does zero DB reads of its own; it looks up `map.get(sourceRef)`
and calls `resolveMnemonicAffordance` on a wrong outcome, handing the result to
`ExerciseFeedback` as callback-only props (`mnemonic`/`mnemonicOffer`/`onCreateMnemonic`)
plus owning the `MnemonicWorkshop` modal's open-state.

**The workshop** (`components/mnemonics/MnemonicWorkshop.tsx`) is the one place besides
`Session.tsx`'s prefetch that this feature is allowed to talk to Supabase directly: on
open it fetches the single existing note (`fetchMnemonic`) to pre-fill the textarea (so
it doubles as create *and* edit), and on save calls `upsertMnemonic` and fires an
optional `onSaved(note)` callback so a host with its own in-session note map (the
player) can update it without a re-fetch.

## 3. Invariants

1. **Word-level grain, not per-capability.** The table key is `(user_id, source_ref)` —
   one note serves every capability of a word (design §5). Two writers (the feedback
   screen and the Progress stubborn-words card) MUST key on the same raw `source_ref`
   string; this is why `StubbornWordsCard`'s dedupe-by-*display-label* was a bug (C1,
   fixed alongside this module — see the card's own file for the raw-`source_ref` fix).
2. **Never on the prompt.** The affordance is only ever passed into `ExerciseFeedback`
   (the Doorgaan/feedback screen), never into any exercise-prompt component — a hard
   rule from the design (#4), enforced structurally by `ExperiencePlayer`'s existing
   branch between `ExerciseFeedback` and `CapabilityExerciseFrame`.
3. **`ExperiencePlayer` does no DB reads.** All Supabase I/O for the feature lives in
   `lib/mnemonics/adapter.ts` (host-prefetch path) and in `MnemonicWorkshop.tsx` (its
   own fetch-on-open) — never inline in the presentational player.
4. **`affordance.ts` is pure.** No I/O, no `Date.now()`, no randomness — deterministic
   and unit-tested (`__tests__/affordance.test.ts`).
5. **`upsertMnemonic` sets `updated_at` explicitly.** The DDL's `default now()` only
   fires on INSERT; an `on conflict do update` needs the column in the payload or a
   second edit never bumps it (data-architect R2 MINOR).
6. **No FK on `source_ref`.** It's a content identity (rebuild-friendly), not a
   learner-data FK — a retired `source_ref` just never resurfaces again (harmless
   orphan). GDPR erasure is via `user_id references auth.users(id) on delete cascade`.

## 4. Files

| File | Role |
|---|---|
| `model.ts` | `Mnemonic`, `MnemonicAffordance` — the non-trivial type model |
| `affordance.ts` | `resolveMnemonicAffordance` (pure) + the `MnemonicGateEvidence` narrow-evidence shape it needs from `isStubborn` |
| `adapter.ts` | the only I/O — `learner_word_mnemonics` reads/writes, snake↔camel, owner scoping |
| `index.ts` | the 6-symbol public port |
| `__tests__/affordance.test.ts` | the drift-prone gating decision, colocated |

## 5. Seams to other modules

- **Downstream (reused, not re-derived):** `@/lib/analytics/mastery/masteryModel`
  (`isStubborn`, `STUBBORN_THRESHOLD` = 4) — a feature→analytics dependency, no
  back-edge (target-arch Rule #7). `affordance.ts` takes a `MnemonicGateEvidence`
  (the 3 fields `isStubborn` actually reads) rather than the full
  `CapabilityMasteryEvidence`, because the feedback screen only has the block's
  `CapabilityScheduleSnapshot` on hand, not a full mastery-evidence row.
- **Identity source:** `learning_capabilities.source_ref`, read verbatim (no
  client-side re-derivation) at `src/lib/session-builder/adapter.ts:170`
  (`sourceRef: row.source_ref` → `ProjectedCapability.sourceRef`) →
  `src/lib/exercises/exerciseResolver.ts:71` (`sourceRef: input.capability.sourceRef`
  → `ExerciseRenderPlan.sourceRef`) → read directly off `currentBlock.renderPlan.sourceRef`
  in `ExperiencePlayer`, and independently at `src/lib/analytics/mastery/masteryModel.ts:961`
  (`sourceRef: capability.source_ref` → `CapabilityMasteryEvidence.sourceRef`). Both
  paths are plain passthroughs of the same DB column, so the two writers (feedback
  screen, Progress card) can never key the same word two different ways.
- **Upstream (UI):** `components/mnemonics/MnemonicWorkshop.tsx` — the shared editor,
  in a neutral folder (not `components/progress/`) so `components/experience/` and
  `components/progress/` both import *down* into it rather than into each other.
  `components/mnemonics/MnemonicWordChips.tsx` — extracted 2026-07-09
  (home-mnemonic-weak-words-surface slice 1) out of the pre-existing
  `StubbornWordsCard.tsx:52-115`: the chip-list + has-hook-dot state (its own
  `fetchMnemonicsForRefs` + `onSaved`) + `MnemonicWorkshop` open/close wiring,
  given raw `{sourceRef, sourceKind}` entries. **The sole holder of the
  `labelForSourceRef` call** — computing `label`/`isAffixed` here (not in
  `lib/analytics/mastery`) is what lets that module's `deriveTroublesomeWords`
  stay label-free and avoid an analytics→mnemonics back-edge (mnemonics already
  imports `isStubborn` FROM analytics). `components/progress/StubbornWordsCard.tsx`
  (Voortgang, refactored in the same slice to consume it) and
  `components/mnemonics/TroublesomeWordsSheet.tsx` (Home, new) both render it —
  one implementation of the pattern, no drift.
- **Host (fetch owner):** `pages/Session.tsx` — prefetches the session's
  `Map<sourceRef, note>` via `fetchMnemonicsForRefs`, mirroring the existing `audioMap`
  fetch exactly.
- **Host (Home nudge):** `pages/Dashboard.tsx` — computes the un-hooked
  troublesome-words subset (`getTroublesomeWords` from
  `lib/analytics/mastery/masteryModel`, then `fetchMnemonicsForRefs` to filter
  out already-hooked words) for a conditional `ListCard` nudge, and mounts
  `TroublesomeWordsSheet` (a Modal wrapping `MnemonicWordChips`) on tap. Same
  `fetchMnemonicsForRefs` port, a second host.
- **Sibling regime note:** this is **learner data** (Operating Context, CLAUDE.md) —
  owner-only RLS, `on delete cascade` from `auth.users`, covered by the nightly dump.
  Schema changes here go through the full gate chain (`migrate-idempotent-check` →
  `migrate` → `pre-deploy`), unlike the pipeline-is-writer content tables.

## 6. Known limitations / what this spec does NOT cover

- **The AI-suggested starter** (a `suggest-mnemonic` edge function) is explicitly
  deferred to slice 2 (design §4.3/§9) — v1 is learner-authored only.
- **No delete UI in v1.** `deleteMnemonic` is exposed on the port for API completeness
  and a likely fast-follow ("clear my hook"), but no consumer calls it yet.
- **No persisted "Niet nu" snooze.** Dismissing the prominent offer only hides it for
  that one feedback-screen render; the next miss re-offers (design §6, accepted for v1).
- **Session-level "already created" note map.** `ExperiencePlayer` keeps a small local
  overlay (updated via `MnemonicWorkshop`'s `onSaved`) on top of the host's prefetched
  map, so a word redrilled later in the *same* session resurfaces instead of
  re-offering. This is player-local state, not part of this module.
- Scheduling/FSRS semantics are untouched by this feature — see
  `docs/current-system/modules/analytics-mastery.md` for `isStubborn` /
  `STUBBORN_THRESHOLD` and the mastery/at-risk ladder this feature reads from but
  never writes to.
