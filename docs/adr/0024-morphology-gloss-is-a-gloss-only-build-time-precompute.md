# ADR 0024 — Morphology gloss is a gloss-only build-time pre-compute

- **Status:** accepted
- **Date:** 2026-06-28
- **Deciders:** data-architect, architect (reader Phase 2, `docs/plans/2026-06-28-reader-phase-2-design.md`)
- **Relates to:** ADR 0011 (DB-authoritative after seeding), ADR 0020/0021 (the morphology moat)

## Context

The Lezen reader (Slice 2) shows, on tap, an **exploratory** morphological gloss: the
affix + its function, the root + its meaning, and the word family. This is a *reading
aid*, not a drill. The drilled morphology — `affixed_form_pairs`, which **becomes
capabilities** routed by ADR 0021 — is deliberately thin and curated, because the
attestation + frequency gate (ADR 0020) exist to keep over-generated junk
(`membanyaki`, `adaan`) out of what learners practise.

## Decision

The reader's morphology lives in a **separate, gloss-only build-time pre-compute**,
`item_morphology`, and **mints no capabilities**:

- **Shape:** keyed by `normalized_text` (the surface word), columns `root`, `affix`.
  *Not* keyed by `learning_item_id` — a derived corpus word is not necessarily a
  `learning_item` (it becomes one only via the Slice-3 harvest pre-seed), and the
  reader looks words up by token text. The glosses are **derived at read time** (affix
  function from the static `AFFIX_CATALOG`, root meaning from `learning_items`, family =
  join over shared `root`) — *not stored*, so the table cannot drift from the
  catalog/items.
- **Source:** projected from the attested `affixed_form_pairs` + the deterministic
  `affixDecomposition` engine (strip-to-propose + derive-to-verify) over the reading
  corpus. Regenerable on republish (ADR 0011 projection regime).
- **Boundary:** `affixed_form_pairs` (the drilled set) is **untouched**. `item_morphology`
  is read by `lib/reading` only.

## Consequences

- Tap-to-explore works for any affixed corpus word without polluting the drilled set or
  minting schedulable capabilities.
- Coverage grows data-drivenly as the morphology rollout + reading corpus grow (re-run
  the population script); no reader code change.

## The thing not to do later

Do **not** "upgrade" `item_morphology` to also mint capabilities (e.g. to auto-create
Affix-Trainer pairs from every corpus word). That re-introduces exactly the
over-generated junk ADR 0020's attestation/frequency gate exists to exclude. Drilled
morphology stays curated in `affixed_form_pairs`; `item_morphology` stays gloss-only.

## Deviation from the design plan (noted for the record)

The plan (data-architect M2) specified `item_morphology` as a 1:1 satellite of
`learning_items` (FK `learning_item_id`) with stored `gloss_nl`/`gloss_en`. During
build, keying by `learning_item_id` was found to couple Slice 2 to Slice 3's pre-seed
(the derived words aren't items yet), so it was re-keyed to `normalized_text`, and the
glosses were made *derived* (not stored) — strictly less mechanism and decoupled. Flag
for data-architect confirmation.
