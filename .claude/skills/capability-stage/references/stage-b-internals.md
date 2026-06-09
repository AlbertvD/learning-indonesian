# Capability Stage (Stage B) internals

Open this while running and monitoring the stage. It pins down the 13 internal
phases (so live progress maps to something), every gate code, which findings are
fresh-lesson-expected, and the symptom→action table for the auto-fix loop.
Authoritative source is `scripts/lib/pipeline/capability-stage/`; verify a cite
if it looks stale (the pipeline moves). The entry point is
`runCapabilityStage(input)` in `runner.ts`; the gates live in `gate.ts` +
`validators/` + `verify/`; the model (counts/findings shape) in `model.ts`.

## Output shape (what every run returns)

`publish-approved-content.ts N` prints a JSON `LessonStageOutput` (Stage A) then
a JSON `CapabilityStageOutput` (Stage B). Stage B:

```
{ "status": "ok" | "partial",          // there is no "validation_failed" for B
  "counts": { contentUnits, capabilities, capabilityArtifacts, learningItems,
              exerciseVariants, clozeContexts, deferredDialogueChunks,
              dialogueClozes, affixedFormPairs, grammarExerciseRows,
              itemDistractorSets },
  "findings": [ { gate, severity: "error"|"warning", message, context } ],
  "durationMs": N }
```

- `status: ok` — no error-severity findings; capabilities were **promoted**
  (draft → readiness=ready / publication=published). Schedulable.
- `status: partial` — writes landed but a post-write verifier flagged an `error`
  (no rollback). **Promotion is skipped** — so the rows exist but stay `draft`
  and are NOT schedulable. Re-publish after fixing the cause. (`runner.ts:148` —
  status is `partial` iff any finding has `severity: 'error'`.)

The CLI `publish-approved-content.ts` exits non-zero if Stage B status ≠ `ok`
(`publish-approved-content.ts:96`).

## The 13 internal phases (live progress map)

The runner logs `✓` / `⚠` lines as it goes. Map the tail to these phases so you
can report "where it is" and spot a stall. Markers are the runner's own
`console.log` strings.

| Phase | What happens | Live signal / watch for |
|-------|--------------|-------------------------|
| 1 | Load Stage-A lesson content **from the DB** + staging files from disk | fast; a load error here = Stage A didn't write what B expects |
| 1b | Enrichment: level, POS (`enrichPos`), dialogue-NL propagation | `✓ Level enrichment…`, `✓ Dialogue translation propagation…` |
| 2 | **Pre-write gate** (CS3/CS4/CS4b/CS5/CS6/CS13) — pure, no DB | findings printed in final JSON; errors here still proceed to write unless they throw |
| 2b | **Dry-run short-circuit** — returns here, before any write/LLM | `[DRY RUN] Lesson N validation passed.` + projected counts. **No DB writes, no billable LLM calls happen in dry-run.** |
| 3 | Project (pure) staging → rows | — |
| 4–5 | Write content_units, learning_capabilities | — |
| 5a | Pre-load DB→DB item + pattern state | — |
| 5c | **Dialogue cloze — LLM generation** (`generateClozeContexts.ts`, Sonnet) + write | **slow + billable + rate-limit-prone.** Single-sentence carrier narrowing (`narrowClozeCarrier`, F2). Item distractors are NOT here — see Stage Vocabulary below. |
| 5d | **Pattern path — grammar-exercise LLM generation** (`generateGrammarExercises.ts`, Sonnet, one call per pattern) + write | **slowest + billable + rate-limit-prone.** `✓ Pattern path: P patterns, X typed exercises (…seeded-skip…)`. Only when the lesson has typed grammar categories. |
| 5d (retire) | Soft-retire orphan capabilities | `✓ Soft-retired N orphan capabilit…` |
| 6–11 | Write junction, artifacts, dialogue/affixed typed rows, grammar_patterns, exercise_variants, dialogue cloze | `⚠ Expected X… landed Y…` |
| 12 | **Runner post-write gate** (CS7→CS8→CS9→CS18) — DB-aware | the verdict that decides ok vs partial; `⚠ Seed-integrity (CS9) failed…` is the loud one |
| 13 | **Promote** capabilities (only if status ok) | `✓ Promoted N capabilities → ready/published`; `⚠ N blocked`; or `Skipping capability promotion (status=partial)` |
| — | POS-coverage summary | `[POS-coverage] Lesson N word/phrase items by POS:` |

**Then — Stage Vocabulary** (`publishVocabulary`, a *separate writer* after the
runner): loads items DB→DB, **deterministically selects** item distractors
(`selectDistractors.ts` — NOT an LLM; replaced the old `generateItemDistractors`),
writes items/caps/content_units/junction/distractors, and runs its **own vocab
gate** (CS4/CS4b/CS5/CS14/CS15/CS16/CS17/CS19/CS20/CS23). Prints a third
`Stage Vocabulary:` report. Fast (deterministic) — it is **not** a slow LLM phase.

The slow, fail-prone phases are now the two *runner* LLM generators — dialogue
cloze (5c) and grammar exercises (5d). Item distractors became deterministic
(cap-v2 #161), so the vocab slice is fast DB I/O. Everything else is deterministic.

## Gates (every CS code)

Pre-write (`runCapabilityGatePreWrite`, pure — `gate.ts`):

| Code | Checks | Severity notes |
|------|--------|----------------|
| CS3 | exercise-candidate payload present + `exercise_type` in whitelist | error |
| CS4 | per-item meaning: `context_type`, valid languages | error |
| CS4b | item translations: `translation_nl` CRITICAL for non-dialogue; `translation_en` WARNING | mixed |
| CS5 | POS: missing pos → warning; invalid pos value → error | mixed |
| CS6 | grammar-pattern slug/name/complexity shape | error |
| CS13 | grammar-exercise typed-row Zod shape (4 tables) | error |
| CS1 | grammar topics (moved from lesson-stage GT1) | error |

Mid-write (inline in runner, after the projectors that need DB cap IDs):

| Code | Checks |
|------|--------|
| CS11 | `dialogue_clozes` typed-row shape (sentence_with_blank/answer_text/translation_text) |
| CS12 | `affixed_form_pairs` typed-row shape (root_text/derived_text/allomorph_rule) |
| CS10 | dialogue-line artifact emission (cloze_context/cloze_answer/translation:l1) |

Post-write — **runner gate** (`runCapabilityGatePostWrite`, DB-aware — `gate.ts`
+ `verify/`). These cover the NON-item surfaces (dialogue, pattern, affixed):

| Code | Checks | Fresh-lesson note |
|------|--------|-------------------|
| CS7 | count parity: DB rows ≥ declared, per surface (`verify/countParity.ts`) | a real mismatch is a projector/upsert-order bug, not bootstrapping |
| CS8 | content non-empty: required columns non-empty for each written row | — |
| CS9 | seed integrity: every non-dialogue published item is **reviewable** (an NL meaning OR a context with an active variant). **CS9 error ⇒ partial ⇒ no promotion** | the loud failure; read the named items |
| CS18 | pattern typed-exercise coverage — every written pattern has ≥1 active row for every required exercise type | a gap = generation (5d) declined/dropped a pattern's type |

Post-write — **vocab gate** (`vocabulary/gate.ts`, run by `publishVocabulary` —
the item slice). A finding on an *item/distractor* lands here, NOT the runner gate:

| Code | Checks | Note |
|------|--------|------|
| CS14 | item POS — word/phrase item has a valid POS tag | POS null warns (Slice 1) |
| CS15 | item distractor **coverage** — every item cap has curated distractor rows | a 0 = the deterministic selector produced nothing for that cap |
| CS16 | item distractor **quality** — len=3, no-answer, no-intra-dup, in-pool, no morphological variant | relocated here from lint-staging; the OLD text-array CS16 (`validators/itemDistractors.ts`) is **retired/unreachable** on the live path (cap-v2 F1) |
| CS17 | cross-lesson item duplicates — same `normalized_text` in two lessons | **fresh-lesson-relevant**: re-publishing an existing lesson is fine; a genuine new collision is a real defect |
| CS19 | item separator-convention validator (e.g. `/`-variant formatting) | — |
| CS20 | item length guard (`validateItemLength`) — rejects over-long de-harvest-leak items | — |
| CS23 | item **audio** coverage — missing `audio_clip` for a word/phrase item | **WARNING only** (#165); audio is a post-publish step, never a publish blocker |

## lint-staging (DB-backed pre-flight, capability-side only)

`publish-approved-content.ts` runs `lint-staging --lesson N --severity critical`
first (`buildLintStagingCommand`); a CRITICAL aborts before any write (use
`--skip-lint` to bypass). Capability-side staging only now:
`grammar-patterns.ts`, `candidates.ts`, `cloze-contexts.ts`, `learning-items.ts`,
vocab-enrichments, exercise coverage. Run it standalone for detail:
`bun scripts/lint-staging.ts --lesson N --json`.

**Fresh-lesson caveat:** some lint rules build the known-word set from the *live
DB* (`dialogue-cloze-blank-not-in-pool` reads `learning_items WHERE
is_active=true`). A never-published lesson's own new vocabulary isn't in the DB
yet, so it can fail on words it legitimately introduces. These are bootstrapping
artifacts (epic #98), **not** content defects — flag as "expected for a fresh
lesson until #98", don't treat as broken. Distinguish from a real lint failure by
asking: would this word be in the pool if the lesson were already published? If
yes → bootstrapping; if it's a genuine shape/coverage problem → real.

## Idempotency & the destructive opt-outs (ADR 0011)

Routine re-runs are **additive, skip-if-exists** — they never delete seeded rows.
Item distractors skip caps already in `recognition_mcq_distractors`; the pattern
path skips patterns already seeded. So re-publishing to recover from a `partial`
is safe and cheap (only the un-seeded / failed surfaces regenerate).

The ONLY destructive paths, both single-target and explicit:
- `--regenerate <normalized_text>` — delete + regenerate distractors for one item.
- `--regenerate-pattern <slug>` — delete + regenerate grammar exercises for one pattern.

These are the auto-fix tools for a bad-but-written generation result.

## Symptom → action (the auto-fix loop)

Auto-fix the known/transient; halt + alert on genuine content defects.

| Symptom (in the tail or findings) | Class | Action |
|-----------------------------------|-------|--------|
| `429` / rate-limit / SDK retry exhaustion mid-5c/5d | transient | The SDK already retries (`ANTHROPIC_MAX_RETRIES=5`) + throttles (1500ms). If it still throws, re-run with a larger `GENERATION_THROTTLE_MS` (e.g. `GENERATION_THROTTLE_MS=4000 bun scripts/publish-approved-content.ts N`). Idempotent — only the un-seeded rows regenerate. Auto-retry once, then report. |
| CS15 coverage 0 / CS16 quality fail on one item | written-but-bad | `--regenerate <normalized_text>` for that item, then re-verify. |
| CS18 pattern missing a required exercise type | written-but-bad | `--regenerate-pattern <slug>` for that pattern, then re-verify. |
| `dialogue-cloze-blank-not-in-pool` (lint or CS) on a fresh lesson | bootstrapping (#98) | Recognise as fresh-lesson-expected. Do NOT mutate content. Report as "expected until #98"; offer `--skip-lint` only if the user wants to push the rest through. |
| CS17 duplicate on re-publish of an existing lesson | benign | Expected — same normalized_text already present from the prior publish. Not a defect. |
| CS17 duplicate of a genuinely different lesson's word | real defect | **Halt + alert.** Two lessons claiming the same item is a content-authoring decision, not an auto-fix. |
| CS9 seed-integrity error (item not reviewable) | real defect | **Halt + alert.** The item lacks an NL meaning or any active variant — a staging/authoring gap. Name the items; the fix is upstream (`learning-items.ts` / re-run the creators), not a re-publish. |
| CS7 count parity mismatch | real bug | **Halt + alert.** Projector/upsert-order bug — the `findings` message names the diverged surface. Do not paper over with re-run. |
| CS3/CS4/CS6/CS13 pre-write error | real defect | **Halt + alert.** Malformed staging — re-run the relevant creator (grammar-exercise-creator / cloze-creator / linguist-structurer) upstream, then re-publish. |
| `⚠ Capability promotion failed` | real defect | **Halt + alert.** Caps written but not promoted → not schedulable. Read the error; usually an RPC/grant issue. |
| `⚠ Expected X legacy exercise_variants, landed Y` | smell | Note in report; usually a downstream count divergence — check CS7. |

When you halt, still produce the full report up to the halt, name the failing
gate + the offending rows, and state whether a re-publish would help (it does for
transient/written-but-bad; it does NOT for a content/authoring gap — that needs
an upstream fix first).
