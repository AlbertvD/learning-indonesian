---
status: implementing
implementation: branch feat/home-mnemonic-weak-words (slice 1)
reviewed_by: [staff-engineer, architect, data-architect]
review_notes: |
  staff-engineer SOUND-WITH-CHANGES → folded: extract shared MnemonicWordChips (kill
  StubbornWordsCard drift); one un-hooked denominator for card+sheet; pinned sort key;
  dropped unused `kind` field.
  architect APPROVE-WITH-CHANGES → folded: CRITICAL reader stays raw {sourceRef,sourceKind},
  UI computes label (no lib/analytics → lib/mnemonics back-edge); reuse labelForCapability;
  both module specs update same PR.
  data-architect APPROVE-WITH-CHANGES → folded: M1 at-risk via labelForCapability(e,now)==='at_risk';
  M2 scope via funnelBucket() not fresh sourceKind enum. Confirmed TRUE: no schema, no grant,
  no RPC, no writer — learner_word_mnemonics already source_ref-keyed + owner-RLS (migration.sql:3740-3763).
grounded_against:
  - docs/target-architecture.md            # lib/analytics LOCKED + read-only (:55,:179,:642); Dashboard consumes analytics (:192-193)
  - docs/current-system/modules/analytics-mastery.md   # the mastery sub-module this extends (deriveStubbornWords is the mirror)
  - docs/current-system/modules/mnemonics.md           # the mnemonic workshop port this reuses unchanged
  - docs/plans/2026-07-05-stubborn-word-mnemonic-workshop.md   # shipped PR #372 — the workshop + note table + in-session entry
  - docs/plans/2026-06-12-mastery-ladder-lapse-and-stubborn.md # the at-risk = self-healing (don't-drill) decision, which this does NOT touch
---

# Home surface: a "words you keep getting wrong" place to add memory hooks

## Goal

Surface, on **Home**, the list of words the learner keeps getting wrong as a convenient, opt-in place to add an ezelsbruggetje (memory hook) — the *same* action already available per wrong answer in-session, gathered where the learner will act on it between sessions.

This is a **convenience surface, not a new intervention**. It adds no pressure ("fix these"), no drilling, and no new decision about whether at-risk words should be practised — it only aggregates an existing optional action (`MnemonicWorkshop`, shipped PR #372) over the words most worth the effort.

## Why here (placement rationale)

- Home is the **act** surface (Start-CTA + between-session nudges as `ListCard`s: backlog, continue-lesson, study-tip — `Dashboard.tsx:244-268`). Voortgang is the **reflect** surface. A "do this now, if you like" prompt belongs on Home.
- Today the only analytics-side entry to the workshop is `StubbornWordsCard` (Woordenschat tab), gated to the strict stubborn signal and hidden when empty — so in practice it is almost never seen. The "45 woorden aandacht nodig" box (`MasteryJourney.tsx:59-70`) is a dead-end count with no action.

## What already exists (reuse, do not rebuild)

- **`MnemonicWorkshop`** (`src/components/mnemonics/MnemonicWorkshop.tsx`) — neutral, `source_ref`-keyed, works for **any** word. Props: `{ userId, sourceRef, label, isAffixed?, opened, onClose, onSaved? }`. Nothing about it is stubborn-specific.
- **mnemonics port** (`src/lib/mnemonics/index.ts`) — `fetchMnemonicsForRefs(userId, refs) → Map<sourceRef, note>`, `labelForSourceRef(sourceRef)`.
- **In-session entry** — on a wrong answer, `ExperiencePlayer → ExerciseFeedback` already offers the hook (the primary, always-available, learner-choice mechanism). This surface is purely additive to it.
- **The signal derivers** — `deriveStubbornWords` (mastery sub-module) is the exact mirror for the new at-risk deriver; the per-cap `at_risk` word-label already exists (`masteryModel.ts:180-187`).

## Design

### 1. One analytics reader — the "keep getting wrong" set

Add to the mastery sub-module a single reader that derives, from **one** `allLearnerEvidence(userId)` fetch, the distinct words the learner keeps getting wrong:

- **Set** = at-risk ∪ stubborn, deduped by `source_ref`. **Reuse the canonical predicates — do not restate them inline** (data-architect M1, architect):
  - **at-risk** — `labelForCapability(e, now) === 'at_risk'` (the exported canonical predicate, `masteryModel.ts:176,185-188`; the `at_risk` branch has no `now` dependency). Do NOT copy the `lapseCount>0 && consecutiveFailureCount>0` boolean.
  - **stubborn** — `isStubborn(e)` (exported, `masteryModel.ts:642`), exactly as `deriveStubbornWords` reuses it (`:660`).
  - These two are **mutually exclusive at the cap level** (`lapseCount` 0 vs >0), so no double-count; a multi-cap word can qualify via different caps but dedupes to one entry.
- **Shape** per entry: **`{ sourceRef, sourceKind }`** — raw, mirroring `StubbornWord`. **No `label`, no `isAffixed`** in the analytics layer: computing `label` via `labelForSourceRef` (exported only from `lib/mnemonics`) inside the reader would make `lib/analytics/` import `lib/mnemonics/` and, since `mnemonics/affordance.ts:7` already imports `isStubborn` from analytics, **close a back-edge cycle** (target-arch Rule #7, `:63-67`). Label/`isAffixed` are computed in the UI layer (§2), exactly as `StubbornWordsCard.tsx:55-57` does today.
  - **Sort key (pinned):** descending `max(consecutiveFailureCount)` across the word's qualifying caps — "most currently-stuck first." Internal to the sort; not a rendered field.
  - **No `kind` field** — the surface is neutral ("moeilijke woorden") and nothing renders at-risk-vs-stubborn; it fails the omission test, so it is omitted.
- **Scope decision (OQ-1):** **vocabulary + affixed word forms only.** Express via the canonical bucket predicate — `funnelBucket(e.sourceKind) !== null && funnelBucket(e.sourceKind) !== 'grammar'` (`masteryModel.ts:405-410`) — **not** a fresh `sourceKind` enumeration (data-architect M2). `CapabilitySourceKind` has six values; `funnelBucket` already owns the word/grammar/neither split (and maps `dialogue_line_src`/`podcast_*` → `null`), so this survives a future 7th kind. A memory hook for a grammar rule is a different affordance; the in-session entry still covers any item.
- The reader returns the **full** troublesome set (no hook-filtering) — filtering by "has a hook" is the **caller's** concern, so the reader stays a pure, reusable projection (Home filters to un-hooked; a future Voortgang reuse can show all). Reuses `allLearnerEvidence`; **no second round-trip**.

Name TBD (`deriveTroublesomeWords` / `getTroublesomeWords`) — confirm naming against the module's vocabulary during build. Optionally factor a tiny `dedupeBySourceRef` helper shared with `StubbornWordsCard` (data-architect N1).

### 2. Shared chips body — extract, don't duplicate

`src/components/progress/StubbornWordsCard.tsx:52-115` already implements the exact chip-list + has-hook dot + `fetchMnemonicsForRefs` + `MnemonicWorkshop` wiring, including the load-bearing **dedupe-by-raw-`source_ref`** (the C1 fix) and the `labelForSourceRef`/`isAffixed` computation. The sheet must NOT re-implement it.

- Extract that body into one neutral `MnemonicWordChips` component (`src/components/mnemonics/`): given **`{ userId, entries: {sourceRef, sourceKind}[] }`** (raw, matching the reader's output), it computes each `label` via `labelForSourceRef` + `isAffixed` via `sourceKind === 'word_form_pair_src'` (this component is the **sole holder of the `labelForSourceRef` call** — keeping analytics label-free, per the architect back-edge fix), renders the chips, owns the has-hook dot state (`fetchMnemonicsForRefs` + `onSaved`), and opens `MnemonicWorkshop`.
- `components/mnemonics/` is the correct home: it is the neutral leaf both `components/progress/` (StubbornWordsCard) and `components/mnemonics/` (the sheet) import **down** into — no sideways or back edge (architect concurs).
- Both the new sheet **and** the refactored `StubbornWordsCard` consume it — one writer of the pattern, no drift. This refactor is part of slice 1 and also de-risks the slice-2 Voortgang reuse.

### 3. Home nudge — a conditional `ListCard`

In `Dashboard.tsx` `mainCol`, beside the existing nudges:

- **One denominator for count and list:** both the card's number and the sheet's contents are the troublesome words **without a hook yet** (`fetchMnemonicsForRefs`). So "N moeilijke woorden" always matches the panel, and the card disappears once the learner has hooked them all — an actionable, self-clearing nudge, not permanent furniture. Renders `null` at 0.
- Icon 🧩, invitational copy: title *"N moeilijke woorden"*, subtitle *"Woorden die je vaak mist — voeg een ezelsbruggetje toe als je wilt."* (NL+EN). No "aandacht nodig" urgency framing.
- Tap → opens the sheet (§4).

### 4. The picker sheet — the list the learner asked for

New `src/components/mnemonics/TroublesomeWordsSheet.tsx` — a thin Mantine drawer/modal around `MnemonicWordChips` (§2):

- Home passes the **un-hooked** troublesome entries (so count == list length, §3). Tap a chip → `MnemonicWorkshop` (create; on save the dot appears and the word drops from the set on next open).
- Empty/heal behaviour: the set is derived fresh each load, so a word that self-heals (one correct answer) or gets hooked drops off naturally — no stale list.

## Slices

1. **Reader + shared `MnemonicWordChips` extraction + Home card + sheet.** Read-model + UI only. The extraction (§2) refactors `StubbornWordsCard` to consume the shared body in the same slice, so no pattern is duplicated even transiently.
2. *(deferred — OQ-3)* Un-dead-end the Voortgang "aandacht nodig" box: make it open the same `TroublesomeWordsSheet` (there it can pass the full set with dots, edit included). Rewards the reflecting learner; reuses everything from slice 1.

## Out of scope

- A browse/search over **any** word (pre-empting a not-yet-failed word) — a later add-on; here the set is bounded to words already being missed.
- Any change to the at-risk self-healing / don't-drill decision (`2026-06-12-...`). This adds encoding help, not retrieval practice.
- AI-generated mnemonic starters (already deferred to mnemonics slice 2).

## Open questions

- **OQ-1** — RESOLVED: vocabulary + affixed word forms only; exclude grammar patterns.
- **OQ-2** — RESOLVED (staff-engineer): one denominator — un-hooked troublesome words feed both the Home count and the sheet list.
- **OQ-3** Ship the Voortgang reuse (slice 2) now or defer. (Recommend defer; slice 1 is self-contained.)

## Supabase Requirements

### Schema changes
- **None.** `indonesian.learner_word_mnemonics` (user_id, source_ref, note, ts) already exists and is `source_ref`-keyed — it works for any word (shipped PR #372). No new tables/columns.
- RLS/grants: **N/A** — reuses the existing owner-only policy on `learner_word_mnemonics`; the new reader is a read-only projection over already-granted mastery evidence.

### homelab-configs changes
- [ ] PostgREST: **N/A** — no new schema/table.
- [ ] Kong: **N/A** — no new origin/header.
- [ ] GoTrue: **N/A**.
- [ ] Storage: **N/A**.

### Health check additions
- **N/A** — no new structural surface. Coverage is unit tests on the new deriver (mirroring the stubborn-word tests: word-level dedupe, at-risk ∪ stubborn union, `funnelBucket` scope filter, sort order) + a Dashboard render test for the conditional card (shows at ≥1 un-hooked, `null` at 0).

### Docs (same PR — module-spec drift is a code regression, architect)
- `docs/current-system/modules/analytics-mastery.md` — add the new deriver + IO wrapper + return type to §1 (public interface) and Home to §5 (downstream consumers).
- `docs/current-system/modules/mnemonics.md` — record `components/mnemonics/MnemonicWordChips` + `TroublesomeWordsSheet` as new shared-UI seams in §5 and note the `StubbornWordsCard` refactor (spec currently names only `MnemonicWorkshop`).
