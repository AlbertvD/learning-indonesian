# ADR 0020: Morphology pair selection is a deterministic, attestation-validated proposer — not LLM authoring

## Status

Accepted (2026-06-20). Design hammered out with the author via a grill-with-docs session. Amends `linguist-structurer` Step 5b (the morphology-roots authoring half). Relates to ADR 0018 (the 2-cap application tier + cross-source-kind prereqs), ADR 0019 (the derivation engine), ADR 0011 (DB-authoritative-after-seeding / additive re-runs).

## Context

Each Indonesian affix's trainer pool (the `affixed_form_pair`s gathered under one `affix`) should hold a focused set of ~15–25 high-frequency, real, *taught-root* derived forms — enough to teach the rule across its conditioning environments without flooding (the SLA literature: cover each environment, ~15–25 exemplars suffice; the rule tier, not pair count, carries nasalization's weight). Today `morphology-roots.ts` — the lean `(root, affix, illustratesCategory)` list — is **hand-authored** by `linguist-structurer` Step 5b. Hand-authoring can't reliably answer "is this derived form a real word?" (Indonesian affixation is non-productive at the edges; an LLM hallucinates plausible non-words like `kejalanan`), and it can't deterministically pick *the most frequent* taught forms.

## Decision

`morphology-roots.ts` becomes a **generated-derived** file produced by a build-time **proposer** (`scripts/propose-morphology-roots.ts`), replacing Step 5b's morphology-roots authoring (`linguist-structurer` keeps grammar-category *structuring* — the proposer's config depends on those titles). The proposer is deterministic over three inputs:

1. **Taught roots** — `learning_items` (POS-filtered per affix), ordered by `frequency_rank`. The root-vocab prerequisite (ADR 0018) means only taught roots are usable, so the loop is over *our* vocabulary, not the dictionary.
2. **Kaikki etymology** — a pinned, in-repo snapshot of the Wiktionary extraction's **morphological decomposition** (each form → its `affix + root`, from the etymology templates + text), reverse-indexed `"<affix>|<root>" → [forms]`. This is the deterministic "is it *this* derivation?" oracle — **not** a flat is-it-a-word set (the prototype proved flat attestation lets homographs through: `beranda` "veranda" is a real word but is *not* `ber-+anda`; the etymology has no `ber-+anda` template, so it's correctly rejected).
3. **The derivation engine** (`affixDerivation.ts`) — supplies the canonical spelling for the cross-check.

Per `(root, affix)`: look up kaikki's attested `affix+root` forms; engine-derive; **confirm** if the engine spelling is among them (emit, `productive: true`); **flag-irregular** if kaikki attests an `affix+root` form but the engine mis-spells it (e.g. `rupa → berupa` r-drop — surface for an `IRREGULAR`-table entry, don't auto-emit); **skip** if kaikki attests none (the root doesn't take the affix — no homograph can sneak in). For a non-reduplication affix, reduplicated attested forms (internal hyphen, e.g. `berlari-lari`) are filtered out — they belong to the `ber-…-reduplication` affix, not plain `ber-` (the prototype found kaikki decomposes both as `ber+lari`). Per-affix caps (~15–20 invariant, ~20–25 `meN-`/`peN-`); the two nasalising prefixes stratify by engine allomorph class (floor 1/class, report thin classes). Judgment lives in a ~16-line in-proposer config (`affix → home-lesson → category`, with a class→category sub-map for `meN-`/`peN-`, plus per-affix force-include/exclude). Re-runs are **additive** (preserve published roots, append new), with `--regenerate <affix>` as the destructive opt-out (ADR 0011 parity — no orphaned caps / stranded FSRS history).

Everything downstream is unchanged: `morphology-roots.ts` → `generate-morphology-patterns.ts` → Stage A/B → the two `word_form_pair_src` caps per pair.

## Considered options

- **Keep LLM agent authoring (Step 5b as-is)** — rejected: cannot validate realness (hallucinates morphology) and cannot rank by frequency. Deterministic selection from existing data beats LLM generation (the project's stated default).
- **Harvest all of kaikki** — rejected: forms on untaught roots are unusable (ADR 0018 orphan-suppresses them; the generate script hard-fails), and kaikki carries no per-form frequency to rank by. It filters down to exactly the taught-root set anyway, so we enter from our ranked roots instead.
- **Hand-curated `morphology-roots.ts` as source, proposer advisory** — rejected: a half-curated/half-generated file with no clear owner. One owner (the proposer + config) is cleaner and reproducible.

## Consequences

- **Kaikki/Wiktionary data dependency (CC BY-SA).** A filtered snapshot is pinned in-repo for reproducibility and offline builds; attribution required; commercial-use diligence needed if the monetization direction ships.
- **Doc updates required (same change):** `linguist-structurer` Step 5b, `content-pipeline.md`, `linguist-reviewer` §14, and the derived-staging-files note in CLAUDE.md.
- **No schema change.** The `affixed_form_pairs` shape, the 2-cap projection (ADR 0018), CS12/HC31, and the engine (ADR 0019) are untouched — this changes *which roots get authored*, via the same contract.
- **Irregulars are surfaced, not silently dropped** — the flag bucket is the to-do list for `affixDerivation.ts` `IRREGULAR`-table entries.

## Amendment (2026-06-24): the derived-form frequency gate

Filling the hyper-productive suffixes/confixes (`-kan`, `-an`, `meN-…-i`, `di-…-i`) exposed a limit of the kaikki-only oracle. Those affixes attach to almost any root, and kaikki attests even rare/mechanical derivations (`membanyaki`, `menahui`, `adaan`); because the proposer could only rank by the *root's* frequency, the pools filled with junk the attestation oracle had no way to reject (it is a realness oracle, not a quality one).

**Decision: add a second pinned snapshot — a derived-form frequency corpus — as an opt-in gate (`freqGate`).** For a `freqGate` affix, a candidate is emitted only if its engine-derived form is present in the corpus, and the pool is **ranked by that derived-form frequency** (not the root's). The junk forms are absent from any frequency corpus, so the gate removes them deterministically; the kept forms are exactly the real, common words (`memiliki`, `mengunjungi`, `makanan`, `lakukan`). The kaikki branch is retained for loanword-homograph rejection (`beranda`); the two snapshots are complementary — kaikki answers "is it *this* derivation?", frequency answers "is it a real common word?".

This closes morphology coverage to **21/21 catalog affixes**. `freqGate` is off for the invariant prefixes (`ber-`/`se-`/`di-`/`ter-`/…), where over-generation isn't a problem and root-frequency ranking already yields clean pools.

- **Second data dependency (CC BY-SA):** `scripts/data/freq/id-frequency.json` — top-30000 forms from hermitdave/FrequencyWords (OpenSubtitles2018), pinned for reproducible/offline builds. Same attribution + commercial-use-diligence note as the kaikki snapshot. See `scripts/data/freq/README.md`.
- **No schema change**, same contract. Routing (ADR 0021) is unchanged: `se-`/`-kan`/`-an` are transparent → meaning/usage caps; `meN-…-i`/`di-…-i` are confixes → formation caps.
