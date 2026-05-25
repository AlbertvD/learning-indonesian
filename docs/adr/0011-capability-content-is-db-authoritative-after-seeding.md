# ADR 0011: Capability content is DB-authoritative after seeding

## Status

**Accepted (2026-05-25).** Emerged from a grilling session on the Lesson Stage / Capability Stage split (see `CONTEXT.md` → Lesson Stage, Capability Stage, Stage Contract, Capability Review). **Reverses, for the capability side, the principle stated in `CLAUDE.md` and `memory/feedback_pipeline_is_writer_not_db.md`** — both were amended on acceptance (`CLAUDE.md` § Content Management → "Two source-of-truth regimes (ADR 0011)"; the feedback memory now scopes itself to lesson content). The in-flight migration plan `docs/plans/2026-05-22-data-model-migration.md` carries a superseded-in-part notice for its capability-side "reads staging" premise (PRs 1–4 shipped under the pre-ADR-0011 model).

## Context

Two principles in the codebase today collide once you describe how capability content is actually corrected:

1. **"Pipeline is the writer; the DB is a projection of canonical staging files"** (`CLAUDE.md` § Content Management; `memory/feedback_pipeline_is_writer_not_db.md`). Under this rule the staging files (`learning-items.ts`, `grammar-patterns.ts`, `candidates.ts`, `cloze-contexts.ts`, …) are the source of truth, and a re-publish overwrites the DB from them.

2. **Correction happens post-publish, via flag → agent → DB** (`CONTEXT.md` → Capability Review). A reviewer cannot edit content directly; they flag a capability in the app UI (`exercise_review_comments`, keyed to `exercise_variant_id`, 4 rows live today). Agents read the flags and apply the fix by **updating the capability's rows in the database**. The corrected content therefore exists **only in the DB** — no staging file holds it.

The target architecture (`CONTEXT.md` → Stage Contract) makes this collision unavoidable: the Capability Stage's contract with the Lesson Stage is **purely database tables**, so there are deliberately no staging files on the capability side to write corrections back into.

The capability-stage adapter currently **overwrites**: `.upsert(...)` for capabilities/items/patterns (`scripts/lib/pipeline/capability-stage/adapter.ts:70,125,231,450,536`) and `.delete()`+`.insert()` for meanings, dialogue clozes, affixed pairs (350/357, 406/413, 558/566). So a re-run after a correction would silently destroy the agent-applied fix — and because the content is LLM-generated, it would not even reproduce the same exercises.

Generation is non-deterministic (LLM-authored exercises, distractors, cloze contexts, interpreted patterns). `target-architecture.md:49` requires publish to be deterministic. You cannot have all of: non-deterministic generation, blind-overwrite re-publish, and DB-resident corrections. One must give.

## Decision

For **capability content**, the database is authoritative after the first publish. The Capability Stage is a **generator/seeder, not a continuous projector.**

- **Seed once.** The Capability Stage generates a capability and its artifacts and writes them to the DB exactly once.
- **Idempotent, additive-only re-runs.** A routine re-run generates and writes only capabilities/artifacts **not already present** in the DB. It never overwrites an existing published capability. (The blanket upsert / delete-reinsert in the adapter must become skip-if-exists for published rows.)
- **Corrections live in the DB**, applied by the flag → agent loop. They are never overwritten by a routine publish.
- **Full regeneration is explicit and destructive.** "Regenerate this lesson's capabilities from source" is an opt-in flag (`--regenerate`) that knowingly discards flagged corrections. Never the default.

Determinism is preserved by a different mechanism than today's: re-running is stable because it is **additive-only** (it does nothing for already-seeded content), not because generation itself is reproducible.

This scopes the reversal to capabilities. The **lesson-content** side (Lesson Stage) is out of scope here; whether lesson content stays "pipeline-is-writer" or also becomes DB-authoritative is a separate decision.

## Consequences

- **`CLAUDE.md` § Content Management and `memory/feedback_pipeline_is_writer_not_db.md` have been amended (2026-05-25)** to scope "pipeline is writer, DB is projection" to lesson content, and record the capability-side exception. A future reader will otherwise hit both rules and not know which won. (`CLAUDE.md` now carries a "Two source-of-truth regimes (ADR 0011)" subsection; the migration plan `2026-05-22-data-model-migration.md` § "Source-of-truth regimes" flags that its capability-side staging-read premise is superseded here.)
- **The adapter must change from overwrite to skip-if-exists** for published capabilities/artifacts — the additive-only contract. This is the main implementation cost and the riskiest part (it must correctly distinguish "already seeded" from "net-new").
- **The flag channel must generalise.** Today `exercise_review_comments` covers exercises only (`exercise_variant_id`). DB-authoritative correction for *all* capability types needs the flag→agent loop to reach meanings, cloze, patterns, etc.
- **No file-based audit trail of corrections — but daily DB backups are the safety net.** Corrected content lives only in the DB, so the record of "what changed and why" is the flag rows + agent edits + DB history, not git. The database is **backed up daily**, so point-in-time recovery is possible: a bad batch of corrections, or an accidental destructive regenerate, is recoverable by restoring a prior day's backup. The DB (plus its daily backups) is the source of record for capability content.
- **"Regenerate from source" needs a guardrail, but is recoverable.** It stays an explicit destructive flag with a warning (and ideally a count of flagged corrections it would discard) — but because of daily backups, an accidental run is not catastrophic: restore yesterday's snapshot. The guardrail is to prevent silent loss, not irreversible loss.
- **Idempotency here is distinct from ADR 0004.** ADR 0004 is about *review-event* commits being atomic/idempotent. This is about *content seeding* being idempotent. Same word, different subject — worth not conflating.

## Related

- [ADR 0001: capability-based learning core](./0001-capability-based-learning-core.md)
- [ADR 0004: capability review commits are atomic and idempotent](./0004-capability-review-commits-are-atomic-and-idempotent.md) — a different idempotency, noted above.
- `CONTEXT.md` → Lesson Stage, Capability Stage, Stage Contract, Capability Review — the target-architecture terms this ADR operationalises.
- `CLAUDE.md` § Content Management — the principle this ADR reverses for capabilities.
- `memory/feedback_pipeline_is_writer_not_db.md` — same.
