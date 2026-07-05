---
status: approved
reviewed_by: [staff-engineer, architect, data-architect]
supersedes: []
---

# Stubborn-Word Mnemonic Workshop — First Design

**Date:** 2026-07-05
**Grounded in:** `docs/research/2026-07-05-stubborn-word-encoding-interventions.md` (design principles #1–#8).
**Status: APPROVED (2026-07-05).** Review chain: staff-engineer SOUND-WITH-CHANGES → architect R1 REQUEST-CHANGES → data-architect R1 REQUEST-CHANGES → all folded → **architect R2 APPROVED · data-architect R2 APPROVED** (both clean rounds, code-verified). Two non-blocking **dev-pass items** carried into BUILD: (a) confirm the block's `reviewContext.schedulerSnapshot` carries `lapseCount`+`reviewCount` so `isStubborn()` runs (§8 Q4); (b) `upsertMnemonic` sets `updated_at` explicitly (§4.1). Build agent: primary/Sonnet per `feedback_fable_designs_sonnet_builds`.

**R1 changes folded (verified against code):**
- **Staff-engineer:** key by `source_ref` text not a uuid FK (covers vocab+grammar+affix, stable across republishes); drop the `source` enum; defer the AI edge function; no-RPC upsert.
- **Architect (module/seam lens):** restructured to a **`lib/mnemonics/` hexagonal deep module** (§4) per the "work by the deep modules" directive — pure `resolveMnemonicAffordance` + adapter, narrow `index.ts`. Corrections: the block carries `renderPlan.sourceRef` **directly** (`compose.ts:134-136`) — **no `capabilityId→source_ref` hop** (old `:215-216` cite was the commit payload); the **host `Session.tsx` owns the fetch** (mirrors `audioMap`), `ExperiencePlayer` stays presentational/fetch-free; `MnemonicWorkshop` moves to a **neutral `components/mnemonics/`** (no `experience→progress` back-edge); `ExerciseFeedback` gets a **callback-only** prop (no primitive→feature mount); the offer gate **reuses `isStubborn()`** not a bare `>=4`.
- **Data-architect (schema/triangle lens):** **CRITICAL C1** — `StubbornWordsCard` dedupes by *display label*, discarding `source_ref` (`:47`); must dedupe by raw `source_ref` or the two writers key the same word differently. FK-less `source_ref` key **confirmed sound**. Housekeeping: literal idempotent DDL with **one `for all` policy**, **drop the redundant `(user_id)` index**, **`COMMENT ON COLUMN`** the personal-data note, **no `migrate.ts` edit** (generic runner). **M1 dev-pass:** grep-confirm both `renderPlan.sourceRef` and mastery-evidence `sourceRef` are verbatim passthroughs of `learning_capabilities.source_ref` (§8 Q4).

## 1. One-line

When a word tips **`moeilijk`** (stubborn), the **answer screen** becomes the surface: if you fail the word and have no association yet, it offers to help you **build and save your own** (optional AI-suggested starter later); if you already have one, it **resurfaces that association** below the correct answer — fading once the word stabilises. The Progress stubborn card is the secondary place to browse and edit past associations.

This turns the existing *passive* `StubbornWordsCard` advice ("try a mnemonic") into an *actionable* workshop anchored at the moment of failure, and threads the saved mnemonic into the retrieval loop the app already runs.

## 2. Why (research → decisions, one line each)

- **Encode, don't drill; but keep the drills.** The mnemonic exists to lift first-retrieval success over the ~50% threshold where FSRS retrievals start paying off (PMC10839596). We add no new drill and remove none. → principle #1.
- **Learner-authored by default, AI-starter on demand.** Generation effect + the app can't pre-author personal mnemonics; AI/supplied cues are the scaffold for abstract words / blank-draws (SMART, Campos). → #2.
- **Resurface at the answer moment, after failure, never on the prompt.** Stage-2 re-encoding is the lever; showing it on the prompt would destroy the retrieval attempt (Kornell & Vaughn, Pyc & Rawson). → #4.
- **It disappears by itself — one rule, no timer.** The hook auto-shows on a wrong answer and never on a correct one, so it simply stops appearing once you stop missing the word (and returns if the word later slips). No schedule, no graduation flag. A forced fade isn't even needed: because the hook is feedback-only and never on the prompt (#4), every review stays a clean unmediated retrieval, so van Hell's slower-mediated-retrieval cost never applies. → #5, §6.
- **The note is precious learner content.** Owner-only RLS table, backed up, GDPR-erasable. → #7.
- **Author it *at the moment of failure*, not only on an analytics page.** The primary entry point is the feedback screen itself: the same surface that *resurfaces* a saved association also *offers to create one* when the word is stubborn and has none. That's the peak-motivation moment (you just failed it again) and it reuses one component in two states. The Progress stubborn card is the secondary browse/manage home. (Deliberately more surface than a Progress-only entry — justified because a hard-words list on an occasionally-visited page would get far less use than a prompt in-flow.) → placement decision 2026-07-05.
- **Explain *why* we offer it and *how* it helps — the offer is never a bare button.** A learner who just failed a word for the 4th time needs the reframe ("this is normal for hard words, and it's not on you"), the *why reps won't fix it*, the *how a hook works*, and the *test-expectancy* cue ("we'll bring it back when you miss it"). Grounded in the adjacent verified finding that **framing a study action explicitly — telling learners a looked-up item will be reviewed — raises engagement at no cost** (reading research 2026-06-28, principle #8, test-expectancy PMC9851552), plus the motivational value of naming the labor-in-vain reframe. → new copy in §6a.

## 3. Scope

### In scope (v1)
1. **A per-`(learner, source_ref)` mnemonic store** — one free-text association note per stubborn item, with timestamps. Keyed by `source_ref` (not a `learning_items` uuid), so it works for **every** stubborn kind — vocab, grammar, affix — with one shape.
2. **A "Mnemonic Workshop" editor** — write your association → save. Seeded with **cause-matched prompts** (sound-alike+picture / a-sentence-about-you / break-it-into-parts). Prompt-light; **AI "suggest a starter" deferred to slice 2** (see §9). Reached from **two** entry points:
   - **Primary — in-session, on the feedback screen (two-tier).** On a wrong answer for a word with **no** note: if the just-failed capability has tipped stubborn (`>= 4`) → a **prominent** reframe offer (peak-motivation nudge); if it's an earlier miss (1–3) → a **quiet** "➕ ezelsbruggetje maken?" link (opt-in, no interruption). Both open the workshop for that word; only the visual emphasis differs (§6). Word-level: any one stubborn capability earns the prominent offer.
   - **Secondary — the Progress → Woorden stubborn card** (`StubbornWordsCard`, `Progress.tsx:71`): tap a chip → open the workshop. The browse/manage home for revisiting and editing associations authored earlier. (Requires the C1 fix — dedupe chips by raw `source_ref`, not the display label — so this entry keys notes identically to the in-session path; §4.2.)
3. **Resurfacing on the feedback screen** — whenever you fail **any** capability of a word that **has** a saved mnemonic, `ExerciseFeedback` shows the saved association below the correct answer (the word-level hook helps whichever direction you slipped on). Same surface as the create-entry, opposite state (has-note → show; no-note-but-stubborn → offer create). Auto-show is failure-gated, so it fades emergently as the word stops failing; on-demand after that (§6).
4. **The explanatory copy** (§6a) — the offer, workshop intro, cause-matched prompts *with worked Indonesian examples*, resurfacing label, and first-run explainer. In `T.mnemonic.*` (NL-first + EN). This is a v1 deliverable, not polish: without the *why/how* framing the offer reads as "you keep failing" and gets dismissed.

### Out of scope (later slices)
- **AI-suggested starter + its `suggest-mnemonic` edge function** → slice 2. Research makes self-generation the default (§2.2), so v1 is learner-authored-only; the AI scaffold is a smaller, separate gate and is the only thing that gives a `source` tag meaning.
- **Contrast-confusable exercises** (needs a confusable-word source; has the "skilled-readers-only" limit — research Part 4.4). Defer.
- **Drawing/sketch affordance** (thin L2 evidence, awkward on mobile — research 2.5). Defer.
- **The *app* auto-generating or bulk pre-seeding mnemonics for words.** Still out (#8): the prominent, attention-grabbing *nudge* stays targeted to stubborn words. Note this is distinct from — and does not contradict — the learner *choosing* to author a hook early via the quiet affordance (§6 case 3): learner-initiated early creation is in; app-initiated mass creation is not.
- **Ranking/culling mnemonics by learner rating.** Explicitly rejected (#6, SMART expressed≠observed). No ★ button in v1.

## 4. Shape — a hexagonal deep module (per target-architecture Rules #1–#7)

**Corrected after architect + data-architect R1 (2026-07-05) and the "work by the deep modules" directive.** The first cut leaked domain logic and a DB read into components and proposed a thin `services/` adapter. That fails the deep-module discipline. The right shape: the mnemonic feature **hides non-trivial logic** (the two-tier resurface/offer/fade decision, the `isStubborn` reuse, the canonical-`source_ref` contract), so it clears the promotion criterion (target-arch:31) and becomes a hexagonal module `src/lib/mnemonics/` that owns its **model + logic + adapter** behind a narrow `index.ts` (Rule #2). Components stay presentational; the host owns the fetch.

### 4.1 `src/lib/mnemonics/` — the deep module (new)
| File | Role |
|---|---|
| `model.ts` | Types: `Mnemonic` (`sourceRef`, `note`, timestamps); `MnemonicAffordance` = discriminated union `{ kind:'resurface', note } \| { kind:'offer', tier:'prominent'\|'quiet', sourceRef, failureCount? } \| { kind:'none' }`. The non-trivial type model that (with the logic file) clears the depth floor (target-arch depth rule #2). |
| `affordance.ts` | **Pure** `resolveMnemonicAffordance({ sourceRef, note, evidence, outcome }): MnemonicAffordance` — the one place the two-tier gating + fade rule live (§6). **Reuses `isStubborn` from `@/lib/analytics/mastery`** (a downward dep — feature→analytics, no back-edge; Rule #7) rather than re-deriving `consecutiveFailureCount>=4`, so a lapse (`lapseCount>0`) never gets the acquisition-framed offer (architect NOTE). Deterministic (Rule #4) → unit-tested. |
| `adapter.ts` | The Supabase I/O seam (Rule #2/§`adapter.ts`): `fetchMnemonic`, `fetchMnemonicsForRefs(userId, refs)→Map`, `upsertMnemonic`, `deleteMnemonic`. Hides `'indonesian'`, the table name, snake↔camel, RLS. Earns its keep via the batch `Map` shaping + owner scoping (not a 2-line passthrough). **`upsertMnemonic` must set `updated_at` in the payload explicitly** — the DDL `default now()` fires only on INSERT, so an `on conflict do update` won't refresh it otherwise (data-architect R2 MINOR). |
| `index.ts` | Public port: `resolveMnemonicAffordance`, the four adapter fns, the two types (~7 symbols, < 10). |
| `__tests__/affordance.test.ts` | The drift-prone gating decision, colocated. |

Module spec `docs/current-system/modules/mnemonics.md` lands with the second substantive file, per the module-spec rule. One job (Rule #3): *the learner's personal memory hook for a word* — model, decide-when-to-surface, persist.

### 4.2 UI + host wiring (components stay thin; host owns I/O)
- **`src/components/mnemonics/MnemonicWorkshop.tsx` (new, NEUTRAL home).** The shared editor, in its **own** component folder — **not** `components/progress/` (architect W3): it's opened from both `experience/` and `progress/`, so parking it inside one consumer makes `experience/ → progress/` a sibling back-edge. Both consumers now import *down* into a neutral component. Reads/writes via `lib/mnemonics`.
- **`src/pages/Session.tsx` (host) owns the fetch** (architect W2). It prefetches the session's `Map<sourceRef, note>` via `lib/mnemonics.fetchMnemonicsForRefs` and passes it as a prop — **mirroring `audioMap` exactly** (`Session.tsx:174-177` fetch, `:270` "ExperiencePlayer is presentational — the host owns the fetches", `:305` prop). `ExperiencePlayer` keeps doing **zero DB reads**.
- **`src/components/experience/ExperiencePlayer.tsx` — presentational.** It reads the current block's `source_ref` **directly off `currentBlock.renderPlan.sourceRef`** — already present on every `ExerciseRenderPlan` and read synchronously today (`compose.ts:134-136`); **there is no `capabilityId→source_ref` resolution hop** (architect W1 — the old cite `:215-216` was the answer-commit payload, not the block shape). On a `wrong` outcome it calls `resolveMnemonicAffordance(...)` and hands the result to `ExerciseFeedback`, mirroring how it already assembles feedback via `feedbackPropsFor` (`ExperiencePlayer.tsx:353-358`). It owns the workshop modal open-state and mounts `MnemonicWorkshop`.
- **`src/components/exercises/primitives/ExerciseFeedback.tsx` — one optional, callback-only prop** (architect W4/W5): `mnemonic?: { text: string }` (render below the correct-answer card) **and/or** `onCreateMnemonic?: () => void` (a create affordance). The primitive **renders and emits only** — it never imports or mounts `MnemonicWorkshop` (no primitive→feature back-edge). The player owns the branch, so "never on the prompt" (#4) is enforced structurally: props go only into `ExerciseFeedback` (`:351-359`), prompts render on the other branch (`CapabilityExerciseFrame`, `:361`).
- **`src/components/progress/StubbornWordsCard.tsx` (`Progress.tsx:71`) — secondary entry, with the C1 fix.** Each chip becomes tappable → opens the same `MnemonicWorkshop`. **CRITICAL C1 (data-architect):** the card today dedupes by the *display label*, discarding `source_ref` (`StubbornWordsCard.tsx:16-20` `displayLabel`, `:47` `new Set(map(displayLabel))`, `:61-65` renders the stripped string) — so a naive chip-tap would key the note by a *different* string than the in-session path, fragmenting the same word's note across the two writers. **Fix: dedupe by raw `source_ref`** (carry `{ sourceRef, label }` pairs / `Map<sourceRef,label>`) and pass the raw `source_ref` into the workshop-open call. A small "has-note" indicator on chips that already have an association.

### 4.3 AI starter (slice 2, not v1)
An edge function `suggest-mnemonic` (self-hosted edge-function pattern, like `commit-capability-answer-report`) taking the ID word + NL/EN gloss (+ optional root/affix), returning a short starter association; model key server-side; honest-failure fallback. Deferred so v1 is a smaller gate; it's the only consumer of the cut `source` column.

## 5. Data model (first cut — for data-architect)

Literal idempotent DDL (data-architect N2 — spelled out, per-policy idiom, `make migrate-idempotent-check`-ready):

```sql
create table if not exists indonesian.learner_word_mnemonics (
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_ref  text not null,          -- the stubborn item's identity (e.g. 'learning_items/pintar',
                                       -- 'lesson-6/pattern/...') — the SAME key deriveStubbornWords emits
  note        text not null check (char_length(note) between 1 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, source_ref)
);
-- No separate (user_id) index (data-architect N1): the PK (user_id, source_ref)
-- is a leftmost-prefix btree that already serves every `where user_id = auth.uid()`
-- filter and the batch fetch. (The precedent's learner_reading_harvest_user_idx is
-- redundant too; don't perpetuate it.)

comment on column indonesian.learner_word_mnemonics.note is
  'Learner-authored memory hook. May contain personal facts by design (self-reference prompt); cascade-deleted with the account.';  -- data-architect N4

alter table indonesian.learner_word_mnemonics enable row level security;

-- ONE for-all owner policy (data-architect N3): the table is fully owner-editable,
-- so a single policy gives the identical guarantee with one moving part (vs the
-- 4-policy split learner_reading_harvest needs only because it's insert+select-only).
drop policy if exists "word mnemonics owner all" on indonesian.learner_word_mnemonics;
create policy "word mnemonics owner all"
  on indonesian.learner_word_mnemonics for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on indonesian.learner_word_mnemonics to authenticated;
grant all on indonesian.learner_word_mnemonics to service_role;
```

- **Key = `source_ref` text, not a `learning_items` uuid** (staff-engineer, verified). Three reasons: (i) it is the identity `deriveStubbornWords`/`StubbornWord` already carry (masteryModel.ts:38,649,662) and the `StubbornWordsCard` already holds — no second identity, no translation hop on write; (ii) it covers **all** stubborn `sourceKind`s (vocab, grammar, affix) with one table, where a uuid FK would silently drop the non-vocab ones; (iii) `source_ref` is **stable across content republishes** whereas `learning_items` uuids are rewritten from staging on publish (see `project_translation_nl_rewritten_from_staging`) — keying to the stable identity avoids orphaning a learner's note when content re-seeds.
- **Grain = per item (`source_ref`), shared across ALL its capabilities — not per capability.** A word has several capabilities (recognise the meaning, produce the form, hear it, …) and `deriveStubbornWords` emits one row *per stubborn capability*, but they share a `sourceRef`. There is **one** note per word, and it serves **every** capability of that word. Rationale: a memory hook encodes the word's form↔meaning link, which is the same knowledge whichever direction the exercise tests — a good hook for *pintar* helps you recognise *and* produce it. Per-capability notes would fragment the learner's one idea and duplicate it. The workshop de-dupes to one note per `sourceRef` — **but the card's current `[...new Set(map(displayLabel))]` (StubbornWordsCard.tsx:47) de-dupes on the *stripped display label*, discarding `source_ref` (C1); it must de-dupe by raw `source_ref`** so the card entry keys the same string the in-session path uses (see §4.2). This makes the across-capability behaviour concrete (see §6): **offered** the first time *any* one capability of the word tips stubborn; **resurfaced** whenever the learner fails *any* capability of a word that has a note.
- **No `source` enum in v1** (staff-engineer omission test): its only consumer is the AI-vs-self outcome analysis, which needs the slice-2 AI function — a stored constant until then. Added in the slice that gives it meaning.
- **No FK on `source_ref`** — it is a content identity, not a learner-data FK, and content is rebuild-friendly. A note whose `source_ref` is later retired simply never resurfaces (a harmless orphan). GDPR erasure still works: the `user_id` FK `on delete cascade` from `auth.users` removes all of a learner's notes.
- **Precious-data posture:** owner-only RLS, `on delete cascade` from `auth.users` (GDPR erasure), covered by the nightly dump. This is additive learner-data schema → full gate chain (`migrate-idempotent-check` → `migrate` → `pre-deploy`).

## 6. Feedback-screen logic — the one surface, three states (where the ADR-0007-style care goes)

- **The decision is a pure function in `lib/mnemonics`, not inline branching** (deep-module discipline). `Session.tsx` prefetches the `Map<sourceRef,note>` (mirroring `audioMap`); `ExperiencePlayer` reads `currentBlock.renderPlan.sourceRef` **directly** (already on the block, `compose.ts:134-136` — no resolution hop; architect W1) and, on a `wrong` outcome, calls `resolveMnemonicAffordance({ sourceRef, note: map.get(sourceRef), evidence, outcome })`. The component just renders whatever kind the function returns. Per-block lookup is in-memory.
- **Across capabilities: the note is word-level; the two triggers use different per-capability gates.** The word being failed right now is a *specific* capability, but the note is looked up (and written) by `source_ref`, so whichever skill you fail, the *same* note is in play.
- **`evidence` = the failed capability's build-time review snapshot** (`currentBlock.reviewContext.schedulerSnapshot`, `capabilityReviewProcessor.ts:12,23`). Two consequences the developer pass must honour: (a) the offer gate calls **`isStubborn(evidence)`** (needs `lapseCount===0 && reviewCount>0 && consecutiveFailureCount>=4`, `masteryModel.ts:642-646`) — so verify the snapshot carries `lapseCount` + `reviewCount`, not only `consecutiveFailureCount`; if it doesn't, enrich the snapshot or the offer can't distinguish a lapse from acquisition-failure (architect NOTE). (b) The `{n}` count is the **build-time** snapshot — it does not include the just-failed in-session attempt, so it may lag the live streak by the session's own misses; acceptable (it's still an honest "≥4 across sessions"), but the copy must not claim more precision than the snapshot has.
- **On a `wrong` outcome, three cases (evaluated on the word's note + the just-failed capability). The create path is *two-tier* — a prominent nudge only when stubborn, a quiet affordance on any earlier miss:**
  1. **Word HAS a note** → **resurface it**, regardless of *which* capability you just failed. `ExerciseFeedback` shows the association below the correct answer. Gate = simply *has-note + this was a wrong answer* (no threshold — if you took the trouble to write a hook, you want it whenever you slip). (Pyc & Rawson: the mediator shown at the moment it's needed.)
  2. **Word has NO note, and the capability you just failed is stubborn** (`consecutiveFailureCount >= STUBBORN_THRESHOLD`, i.e. ≥4) → **prominent offer**: the full reframe card (§6a A, with the `{n}×` count) → opens `MnemonicWorkshop`. Only *one* capability needs to have tipped stubborn to earn it. This is the "we noticed you keep missing this" nudge.
  3. **Word has NO note and the just-failed capability is *not yet* stubborn (1–3 misses)** → **quiet affordance**: a small, low-emphasis "➕ ezelsbruggetje maken?" link tucked under the correct answer — no reframe copy, no count, no interruption. A learner who already senses a word is tricky can start a hook early; everyone else ignores it. Evidence-aligned (a hook lifts first-retrieval success from the *first* encounter — PMC10839596 — so early creation is if anything more efficient than waiting for 4 wasted failures), while keeping the *prominent* nudge targeted to genuinely-stubborn words (#8). Same `MnemonicWorkshop`, same component as case 2 — just the stubborn flag toggles prominent-vs-quiet, so this is a visual-emphasis variant, **not** new mechanism.
  - *(Never-failed words: this in-session path only fires on a miss. A fully-manual "➕ hook" entry from a word/vocabulary surface — create one for a word you haven't missed at all — is a cheap extension noted in §8, not core v1.)*
### The exact disappearance rule

There is **no timer, no "graduated" flag, no threshold** for the resurfacing. The rule is one line:

> **The hook auto-appears on a `wrong` answer, and only then. It never appears on a correct answer.**

Everything else follows from that:
- **It stops appearing when you stop missing the word.** A word you've learned isn't failed, so its hook is simply never triggered — that *is* the disappearance. No state to flip, nothing to expire.
- **It comes back on its own** if a word you'd mastered starts slipping again — the next miss shows it. Self-healing in both directions.
- **On-demand always.** Even when it isn't auto-appearing, it's one tap away (feedback-screen "toon mijn ezelsbruggetje", the word's detail, and the Progress card).

**Why no forced fade is needed** (correcting the earlier van-Hell framing): the hook is shown **only at feedback, never on the prompt** (#4), so every review is still a clean *unmediated* retrieval attempt — the direct route keeps automatising regardless of whether a hook exists. Van Hell's slower-mediated-retrieval cost applies to mnemonics used *at test*; ours isn't. So the "fade" is pure UX hygiene (don't show a hook you don't need), and "show on a miss, silent on a hit" delivers it with zero extra mechanism.

**The create path's own disappearance:** any create affordance (prominent or quiet) is shown only while the word has **no note** and you just missed it — it vanishes permanently the moment a note exists, and never appears on a correct answer. The *prominent* tier additionally requires the just-failed capability to be stubborn (≥4); below that you get the *quiet* link. Both are silent on a hit. *(A "Niet nu" snooze that suppresses the offer for a while is a possible later refinement; v1 just re-offers on the next miss.)*
- **On-demand always:** even after fade, a small "show my association" affordance keeps a saved note reachable on the feedback screen and in the item's detail. *(Scope-trim candidate — see §8 Q4.)*
- **Never on the prompt.** Hard rule (#4). The note / create-affordance is passed only into `ExerciseFeedback`, never into any exercise prompt component.
- **Authoring mid-session must not disrupt the review.** Opening the workshop from Doorgaan pauses on the feedback screen (the answer is already revealed — no retrieval in flight); saving returns to the normal Continue flow. Confirm the modal/drawer interaction against the Doorgaan flow in the developer pass.

## 6a. Learner-facing rationale & copy — why we offer it, how it helps (with examples)

The explanation is part of v1, not polish. It appears at three touch-points, escalating in detail. Draft copy below is **NL-first (canonical) + EN**; strings live in `src/lib/i18n.ts` under a new `T.mnemonic.*` group, consistent with the existing `studyTips.stubborn` block (`studyTips.ts:84`), which this feature makes actionable. Tone: warm, honest, not patronising — matches the app's honest-copy ethos. "Ezelsbruggetje" is the natural Dutch term for a memory hook/mnemonic.

### A. The offer (feedback screen, stubborn word, no hook yet) — short
The reframe + the why + the test-expectancy cue, in three lines and a button.

> **NL** — 🧩 **Dit woord wil maar niet blijven plakken — en dat ligt niet aan jou.**
> Je had 'm nu **{n}× op rij** niet goed. Nóg een keer herhalen helpt dan weinig; een eigen *ezelsbruggetje* wél. Koppel het aan iets wat je al kent — een klank, een beeld, een grappig zinnetje.
> _We laten jouw ezelsbruggetje terugkomen als je dit woord later weer mist._
> **[ Maak een ezelsbruggetje ]**   [ Niet nu ]

> **EN** — 🧩 **This word just won't stick — and that's not on you.**
> You've missed it **{n}× in a row** now. Repeating it again barely helps then; your own *memory hook* does. Link it to something you already know — a sound, an image, a silly little sentence.
> _We'll bring your hook back if you miss this word again later._
> **[ Make a memory hook ]**   [ Not now ]

**Data binding for `{n}`:** the `consecutiveFailureCount` of the *specific capability that just failed* (the one that crossed `STUBBORN_THRESHOLD = 4`, masteryModel.ts:640) — already in hand on the feedback screen, no extra read. It is an honest "in a row" count (consecutive, self-clearing on a correct answer), so at the first offer `{n} ≥ 4`. Naming the real number makes the flag legible ("why is this suddenly asking me this?") instead of feeling arbitrary — the same transparency the Progress card already gives via "how many times."

### A′. The quiet early affordance (word with no note, 1–3 misses) — one line, no reframe
A single low-emphasis link under the correct answer, no card, no count. It just opens the same workshop.

> **NL** — ➕ _Zelf een ezelsbruggetje maken voor dit woord?_
> **EN** — ➕ _Make your own memory hook for this word?_

Distinct from the prominent stubborn offer (A) only in emphasis and the absence of the "not on you / {n}×" framing — an early miss isn't yet a struggle to reframe.

### B. The workshop intro + cause-matched prompts (with worked examples)
Inside the editor, one line of *how it works*, then 2–3 tappable prompts — **each carries a concrete Indonesian example** so the learner sees what "good" looks like. Examples are chosen by the item's `sourceKind` (affixed word → lead with "break it down"; plain vocab → lead with sound-alike/self-reference).

> **NL intro:** Een ezelsbruggetje koppelt een lastig woord aan iets wat je al kent. Je onthoudt een gek, persoonlijk verband veel beter dan kaal stampen — en zélf bedenken werkt beter dan een kant-en-klaar bruggetje. Kies een insteek:
>
> **EN intro:** A memory hook links a hard word to something you already know. You remember a weird, personal connection far better than plain repetition — and making your *own* beats a ready-made one. Pick an angle:

| Prompt (NL / EN) | Worked example shown under it |
|---|---|
| **🔊 Klank + beeld** / *Sound + picture* | *pintar* (slim) klinkt als "**pain**ter" → een **schilder** die superslim is. · *kaki* (been/voet) klinkt als "**khaki**" → een khaki broek over je benen. |
| **🙋 Een zin over jezelf** / *A sentence about you* | *rumah* (huis) → "Mijn **rumah** heeft groene gordijnen." (iets wat écht van jóu waar is — hoe persoonlijker, hoe beter het blijft plakken) |
| **🧱 Hak het in stukjes** / *Break it into parts* (affixed words) | *membaca* (lezen) = **me-** + **baca** ("lezen"-stam) → *actief* lezen. → _link:_ **Affix-trainer: meN-**. · *belajar* (leren) = **ber-** + **ajar** ("onderwijzen") → jezelf onderwijzen. |

- **The morphology prompt links out to the existing Affix Trainer** rather than re-teaching affixes inline (reuse the moat; research 2.5 / §2.5). It appears **first** for `affixed_form_pair` / affixed vocab items.
- A free-text box sits under the prompts — the prompt is a spark, not a form; the learner can ignore it and just write. (Prompt-light default, §8 Q4.)

### C. Resurfacing label + first-run explainer
- **Every resurfaced hook is labelled so its reappearance reads as help, not clutter:** NL "**Jouw ezelsbruggetje**" / EN "**Your memory hook**", shown above the note on the feedback screen.
- **First time only**, a one-tap dismissible explainer states the whole loop plainly (why this word is flagged → why more reps stall → what a hook does → that it'll come back). After that, the terse offer (A) is enough. Reuses the substance of `studyTips.stubborn`.

**Grounding:** telling the learner *up front* that the hook will resurface is a **test-expectancy / framing** move — the reading research (2026-06-28, principle #8; PMC9851552) verified that explicitly framing a study action ("looked-up words get reviewed") **raises engagement at no comprehension cost**. The reframe ("not on you") counters the discouragement of a repeated failure, which is exactly the moment (peak-frustration) the offer fires.

## 7. Supabase Requirements

### Schema changes
- New table `indonesian.learner_word_mnemonics` (§5) → add to **`scripts/migration.sql` only**. **No `scripts/migrate.ts` edit** (data-architect M2): `migrate.ts` is a generic SSH + `docker exec psql` runner that applies the whole `migration.sql` and reloads the PostgREST cache — it has zero per-table logic (the "add to migrate.ts" line was stale template boilerplate).
- RLS: owner-only select/insert/update/delete (`user_id = auth.uid()`).
- Grants: `select, insert, update, delete` to `authenticated`; `all` to `service_role`.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (table is in the already-exposed `indonesian` schema).
- [ ] Kong CORS — **N/A**.
- [ ] GoTrue — **N/A**.
- [ ] Storage — **N/A**.
- [ ] Edge function `suggest-mnemonic` — **N/A in v1** (deferred to slice 2). When built: deployed via the bind-mount SCP + container-restart pattern (like `signup-with-invite`); needs a model API key in the edge-function env.

### Health check additions
- `check-supabase-deep.ts`: assert the new table exists, RLS enabled, owner-only policies present, grants correct (structural, service key) — matches the class `learner_reading_harvest` is checked under.

## 8. Open questions for the review chain
1. ~~Grain + across-capability behaviour~~ **Resolved** (§5/§6): one **word-level** note per `source_ref`, serving all of the word's capabilities. FK-less `source_ref` key **confirmed sound by data-architect** (it reuses the existing stable-cross-republish pattern — `migration.sql:3646,3684` — rather than minting a second identity; no FK is even structurally possible since many capability rows share one `source_ref`).
2. ~~Fetch point / identity resolution~~ **Resolved (architect R1)**: `Session.tsx` prefetches the `Map<sourceRef,note>` (mirrors `audioMap`); `ExperiencePlayer` reads `currentBlock.renderPlan.sourceRef` directly (`compose.ts:134-136`) — **no `capabilityId→source_ref` hop** (the old `:215-216` cite was the commit payload). §4.2/§6.
3. ~~Placement~~ **Resolved**: `lib/mnemonics/` deep module (logic+adapter) + `components/mnemonics/MnemonicWorkshop` (neutral) + host-owned fetch in `Session.tsx` + callback-only `ExerciseFeedback` prop. Entries: feedback screen (primary) + Progress card (secondary).
4. **DEV-PASS BLOCKER (data-architect M1 + architect NOTE):** before implementation, grep-confirm that **both** `ProjectedCapability.sourceRef` (→ `renderPlan.sourceRef`, the writer/reader key) **and** the mastery-evidence `sourceRef` (`masteryModel.ts:38`) are plain passthroughs of the stored `learning_capabilities.source_ref` column with **no client-side re-derivation** — otherwise two definitions of the identity reopen the "two spellings" risk. And confirm the block's `reviewContext.schedulerSnapshot` carries `lapseCount` + `reviewCount` so `isStubborn(evidence)` can run (else enrich it).
5. **Prompt-light vs scaffolded editor** — how much to seed the note field (research Part 4.3); recommend prompt-light in v1.
6. **Mid-session workshop UX** — modal vs drawer from Doorgaan, and confirm it doesn't disturb the review flow (developer/ui pass; §6 last bullet).
7. **Does v1 need the on-demand-after-fade affordance, or is auto-on-failure enough?** (scope-trim candidate.)
8. **Manual "➕ hook" entry from a word/vocabulary surface** — to create a hook for a word you haven't missed at all (0 failures). Cheap (reuses the workshop; a word-detail/vocab-row surface already lists words), but adds an entry point outside the failure flow. Recommend as a fast-follow, not core v1 — the in-session quiet affordance (§6 case 3) already covers "getting tricky" words at 1–3 misses.
9. **Slice-2 (AI starter):** provider + latency budget + honest-failure copy; and reintroduce the `source` column *then*.

## 9. Minimum-Mechanism self-check (the omission test)

- **The table** — omit it and there's nowhere to store learner-authored mnemonics; the whole feature is the resurfacing of *saved* content. Kept. Cheapest form: one row per item keyed by `source_ref`, one text column, no JSON blob, no per-capability rows, **no second uuid identity**.
- **The `source` column** — **cut from v1** (staff-engineer). Its only consumer is the deferred AI slice; until then every row is `'self'` — a stored constant. Reintroduced with slice 2.
- **The edge function** — **cut from v1.** Learner-authored is the research-default; the AI starter is a genuinely-optional scaffold → slice 2, a smaller separate gate.
- **No RPC** — a plain owner-scoped upsert needs none; adding one would be mechanism the RLS already provides. (staff-engineer endorsed.)
- **No FK on `source_ref`** — omitting it is correct: it's a content identity, content is rebuild-friendly, and the stable text key survives republishes that rewrite content uuids.
- **No new fade schedule** — the disappearance rule is "show on a miss, silent on a hit" (§6); no scheduler, no mastery gate, no `consecutiveFailureCount` gate on resurface.
- **`lib/mnemonics/` is a deep module, not container-shaped over-engineering** — it clears the promotion criterion (target-arch:31): `resolveMnemonicAffordance` hides the two-tier + `isStubborn` + fade gating a component author would otherwise inline as a shallow branch (the exact drift target-arch:130-137 warns against), and it clears the depth floor (logic file + adapter + a non-trivial discriminated-union type model). It is the *least* mechanism that keeps the decision pure, testable, and out of the presentational `ExperiencePlayer`.
- **Two entry points, one editor** — the feedback-screen entry is deliberately *more* surface than a Progress-card-only v1 (§2), but adds no new mechanism: it reuses the `ExerciseFeedback` change resurfacing already needs and the one shared `MnemonicWorkshop`. The extra cost is one affordance state, not a new module.

**The "boring version" is now this design:** one word-level table `(user_id, source_ref, note, created_at, updated_at)` owner-RLS with one `for all` policy; a `lib/mnemonics/` deep module (pure `resolveMnemonicAffordance` + a CRUD adapter); one neutral `MnemonicWorkshop` editor; the host (`Session.tsx`) prefetches notes and `ExperiencePlayer` reads `renderPlan.sourceRef` directly and, on a `wrong` outcome, hands `ExerciseFeedback` a callback-only prop; the Progress card (deduped by `source_ref`) opens the same editor. No enum, no edge function, no RPC, no second identity, no per-capability rows, no DB read inside the player — and it fully reaches the pedagogical goal.
