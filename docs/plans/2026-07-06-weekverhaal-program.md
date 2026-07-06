---
status: draft
---
<!-- HIGH-LEVEL PROGRAM SPEC (Bet 2 of docs/plans/2026-07-06-bold-bets-high-level-specs.md).
     Deliberately not implementation-ready: each slice needs its own execution spec +
     full review gauntlet (staff-engineer → architect + data-architect) before building. -->

# "Jouw Weekverhaal" — i+1 personalized generated stories

## Goal

Every learner gets a fresh reading story generated *for them*: ~95% words their FSRS state says they know, the remaining ~5% their due/weak words and weak grammar patterns, woven into a real narrative. Optionally rendered as a personal audio episode. Krashen's i+1 made literal — buildable only because the capability model knows each learner's exact word set.

## Why us / why bold

No competitor tracks per-word learner state precisely enough to constrain generation to it. This is the retention feature: the moment a learner reads a whole story effortlessly *and knows it was written for them*, the app becomes irreplaceable. It is also the natural showcase feature for reviews/press.

## Learner experience

- A tile in Lezen: **"Jouw verhaal van deze week"** — visually distinct from the shared stories.
- Opens in the existing reader: tap-to-gloss, morphological glossing, coverage — all existing behavior, zero new reader UX.
- Weak/due words appear naturally in context; finishing feels easy *because it was engineered to be*.
- Optional "luister" button (audio variant — later slice).
- If generation hasn't run yet (new user, too few known words): the tile shows a friendly threshold state ("nog ~X woorden te gaan"), never an error.

## How it works (concept level)

1. **Input assembly (deterministic, no LLM):** read the learner's known-word set (stability ≥ threshold), due/weak words, and weak grammar patterns from existing capability state. This is a read-only aggregation — same family as the coverage RPC the reader already uses (`lib/reading` `rankReadableTexts` → coverage RPC).
2. **Generation (LLM — genuinely creative, the right tool per the Minimum Mechanism table):** author a short story from a prompt contract: allowed-word budget, required weak/due words, level bracket, length. Reuses the LLM-story authoring path built for the reader (ADRs 0023/0024, `--read-only`).
3. **Validation (deterministic, machine-checkable):** tokenize the output, compute % tokens outside the known set (morphology-aware, reusing the reader's gloss/affix candidate machinery), check length/required-word inclusion. Fail → bounded retries → give up silently until next cycle (the tile keeps last week's story). **Honest limit (staff-engineer):** this checks vocabulary, not *story quality* — whether the prose reads like a real narrative is unverifiable by machine and worst at small vocabularies (a 300-word learner's story risks stilted, not effortless). See open Q2.
4. **Publication:** store as a **per-learner text**. The reader consumes it through the existing `loadReader` path — the story is a `ReadableText` like any other; personalization lives entirely in *which* text, not *how* it renders.
5. **Cadence:** weekly batch per active learner, plus a cooldown-limited "nieuw verhaal" action. Generated server-side (the LLM key cannot ship client-side) — an edge function or the existing pipeline runner; decision for the execution spec.

## The core design question (settle FIRST in the execution spec)

**Per-learner content is a third data regime.** Everything today is either shared content (rebuild-friendly, pipeline-written) or learner data (precious, gated). A personal story is *generated like content but owned like learner data*: owner-scoped RLS, GDPR erasure applies, but losing one is a shrug (regenerate). The execution spec must define this regime explicitly — storage (likely a learner-scoped sibling of `texts`), retention (keep last N), erasure path — and get data-architect sign-off on the regime itself, not just the table.

## Grounding (what exists to reuse)

- `lib/reading` deep module: `loadReader`, `rankReadableTexts`, gloss cascade, morphology glossing (`docs/current-system/modules/reading.md`, verified 2026-06-29) — the entire consumption side is built.
- LLM story authoring + leveling (reader Phase 2, ADRs 0023/0024); story-podcast TTS pipeline (ADR 0022) for the audio slice.
- The `texts` entity (reader slice 1, #305) as the storage precedent.

## Supabase Requirements (high level — execution spec refines)

- **Schema:** one learner-scoped story table (or `texts` + owner column — data-architect decides; regime question above). Owner-only RLS. No learner-state writes anywhere in this program.
- **RPCs:** the known-word/weak-word aggregation read (server-side, small result — per the read-aggregation default).
- **homelab-configs:** none anticipated. **Storage:** audio slice only (existing podcasts bucket pattern).
- **Health checks:** owner-only RLS assertion on the new table.

## Cost & monetization

~1 LLM story/learner/week ≈ cents; TTS audio is the costlier variant. Natural premium split: text weekly free (or trial), audio and on-demand regeneration premium (Phase 2).

## Slices

1. **Generation pipeline + validator** (server-side, admin-triggered for one test learner; no UI).
2. **Storage regime + Lezen tile** (the learner-facing launch).
3. **Audio variant** via the story-podcast TTS pipeline.

## Out of scope

- Harvesting story words back into FSRS (it's deliberately *review*, not new material — the ~5% weak words are already scheduled).
- Multi-chapter serials, learner-chosen topics (nice later knobs, not v1).
- Any reader UX change.

## Open questions (for the execution spec)

1. The per-learner content regime (above — the big one).
2. **Narrative quality without human review (first-class risk, co-equal with Q1):** the validator can't measure "reads like a real story." Mitigations to evaluate: a human spot-check gate for the launch cohort, a minimum-vocabulary floor high enough that stories *can* be good, an LLM-as-judge pass (tokens-are-complexity trade-off to argue explicitly).
3. Generation trigger: cron vs visit-triggered vs pipeline run; and where the LLM key lives (edge function vs homelab runner).
4. Known-word threshold + minimum vocabulary size before the feature activates (interacts with Q2 — below some floor the feature should not exist yet).
5. Topic variety mechanism without learner input (rotate themes deterministically?).
6. NL/EN translation pane: include, or is tap-to-gloss enough? (Lean: gloss is enough — omission test.)
