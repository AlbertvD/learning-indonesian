---
status: draft
supersedes: []
---

# Morphology affix-pool proposer — design note

> Design hammered out 2026-06-20 (grill-with-docs, with the author). Decision of record: **ADR 0020**. This note is the build spec; status stays `draft` until the `ber-` prototype validates the yield and the irregular-flagging.

## Goal

Enrich each affix's trainer pool to ~15–25 high-frequency, **real**, **taught-root** derived forms, **deterministically**, reusing the existing pipeline unchanged. Replace `linguist-structurer` Step 5b's hand-authoring of `morphology-roots.ts` with a build-time proposer.

## Grounding (target architecture / specs read)

- `affixDerivation.ts` (ADR 0019) — the engine; supplies canonical spelling + `IRREGULAR` table (handles `belajar`/`bekerja`; gap: `rupa→berupa`).
- `affixedCapabilities.ts` (ADR 0018) — the projector is **generic over affix type**; 2 caps/pair; `productive=false` skips the produce cap.
- `lib/morphology` module — runtime pools by `affix` across lessons (`loadSelectedAffixScope`); no lesson filter, so a larger pool "just works".
- CONTEXT.md — Affix, `affixed_form_pair`, confix/reduplication; no new domain concept introduced (ADR 0020 is an authoring-mechanism decision).

## The proposer — `scripts/propose-morphology-roots.ts`

A build-time CLI (sibling to `generate-morphology-patterns.ts`). **Writes no DB.** Output = the home lesson's `morphology-roots.ts` (generated-derived, committed).

**Inputs**
1. In-proposer **config**: `affix → { lesson, category } | { lesson, classCategories: Record<class,title> }`, plus per-affix `forceInclude`/`exclude`. ~16 entries.
2. **DB**: `learning_items` (POS-filtered per affix) ordered by `frequency_rank`; root→`learning_item` check (ADR 0018 prereq).
3. **Kaikki snapshot** (pinned in-repo, `scripts/data/kaikki/id-attestation.json`, ~540 kB): the Wiktionary extraction's **morphological decomposition** — each form → its `affix+root` (from etymology templates + text), reverse-indexed `"<affix>|<root>" → [forms]`. NOT a flat is-it-a-word set (see Validation: flat attestation lets homographs like `beranda` through).

**Algorithm** (per affix)
```
reverse = "<affixBase>|<root>" → [attested forms]   // from kaikki etymology
for root in taughtRoots(POS for affix), by frequency_rank:
    real = reverse["<affixBase>|"+root]              // kaikki's attested affix+root forms
           .filter(non-reduplicated, unless affix IS reduplication)
    if real is empty:          SKIP                  // root doesn't take affix; no homograph leaks
    form = deriveAffixedForm(root, affix)            // engine cross-check
    if form ∈ real:            CONFIRM → emit {root, affix, illustratesCategory}, productive:true
    else:                      FLAG irregular (kaikki attests real[0], engine mis-spells → IRREGULAR-table todo)
    // meN-/peN-: bucket by engine allomorph class, floor 1/class, then fill by frequency
    // stop at the per-affix cap
report: per-class counts, thin classes, irregular flags, skips
```

**Caps**: ~15–20 invariant affixes; ~20–25 `meN-`/`peN-`. `illustratesCategory` from config (class→category for the two nasalising prefixes; the generate-script cross-check validates it). `productive: true` on every confirmed pair.

**Re-runs**: additive (preserve previously-committed roots, append new up to a raised cap). `--regenerate <affix>` = deliberate rebuild. (ADR 0011 parity.)

## Rollout

1. Build proposer + config + pin kaikki snapshot. **Prototype on `ber-`** (live home, L11) — verify yield + irregular flags.
2. Run across the **12 affixes with published homes** (meN-/peN-/ber-/di-/se-/-kan/-an/meN-…-kan/di-…-kan/reduplication/reduplication-an/ke-…-an-reduplication) → regenerate `morphology-roots.ts` → publish each home.
3. **Publish the 4 staged book-2 homes** (L23 `-i`, L25 `pe-…-an`, L26 `ter-`, L27 `ke-…-an` — same L11 playbook), then enrich.
4. The **5 homeless affixes** (`memper-`, `per-…-an`, `memper-…-kan`, `meN-…-i`, `di-…-i`) wait on content that doesn't exist in L1–28.

## Doc updates (same change set as the build)

`linguist-structurer` Step 5b (drop morphology-roots authoring; keep grammar structuring) · `content-pipeline.md` · `linguist-reviewer` §14 · the derived-staging-files note in CLAUDE.md.

## Supabase Requirements

### Schema changes
- **N/A** — no schema change. The proposer is build-time tooling that emits `morphology-roots.ts`; everything downstream (`affixed_form_pairs`, the 2-cap projection, CS12/HC31) is the unchanged ADR 0018/0019 contract.

### homelab-configs changes
- [ ] PostgREST — **N/A** (no new schema exposure).
- [ ] Kong — **N/A** (no new CORS/origins).
- [ ] GoTrue — **N/A**.
- [ ] Storage — **N/A**.

### Health check additions
- **N/A** — existing CS12 (carrier-contains-derived) + HC31 (affix ∈ catalog, reduplication carries no circumfix) already cover every pair the proposer emits, regardless of how the root was selected.

## Validation — `ber-` prototype results (2026-06-20)

Ran `scripts/propose-morphology-roots.ts ber- --cap 22` over 1295 taught roots:
- **124 confirmed**, 6 flagged-irregular, 1165 skipped. Confirmed pool is clean plain-`ber-` (berada, berkata, berlaku, bekerja, berdua, berjalan, bersama, belajar, bermain…), far exceeding the cap → frequency-rank + light curation yields the ~20.
- **Two refinements the prototype forced** (now in the algorithm above + ADR 0020):
  1. **Etymology, not flat attestation.** Flat "is it a word" admitted homographs — `beranda` (veranda, a Dutch borrowing) passed as `ber+anda`. Confirming via kaikki's `affix+root` decomposition rejects it (no `ber-+anda` etymology). Same for `beton`/`beban`.
  2. **Reduplication-shape filter.** `ber-`+reduplication forms (`berlari-lari`, `berbesar-besar`) leaked in because kaikki decomposes them as `ber+lari`; filtering reduplicated forms out of a plain-prefix affix sends them to the (gap) `ber-…-reduplication` affix. (Incidentally confirms the L12 ber-reduplication catalog gap is real and populated.)
- **Irregular bucket is precise**: exactly the 6 r-drop cases (`rupa→berupa`, `rumah→berumah`, `raja→beraja`, `rahasia→berahasia`, `renang→berenang`, `racun→beracun`) → the `affixDerivation.ts` `IRREGULAR`-table to-do list. `belajar`/`bekerja` auto-confirm (already in the engine table).
- **Residual** (~3/22, curator-catchable): folk-etymology false positives like `beringin` (banyan tree, not "wishing") — validates keeping the light human/agent curation pass.

## Remaining before generating L11's real file
- `illustratesCategory` here is the single formation category; fine for `ber-` (invariant). The two nasalising prefixes need the class→category sub-map + class-stratified selection (Q4) — build when we reach `meN-`/`peN-`.
- Round-trip the generated `morphology-roots.ts` through `generate-morphology-patterns.ts` (byte-clean) before publish.
- Decide the curation surface (how `beringin`-class residuals get excluded — `exclude` list in config).
