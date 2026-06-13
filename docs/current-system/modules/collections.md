---
module: collections
surface: src/lib/collections/
last_verified_against_code: 2026-06-13
status: in-flight   # slice 2 (runtime gate-OR read) shipped; activation-write + coverage read land in slice 3
---

# `lib/collections/` — selectable word-lists

## 1. Purpose

Owns the *collection* noun: frequency bands (`top-100`, `top-1000`) and thematic packs. A collection is a learner-selectable word-list whose words schedule through FSRS identically to lesson words (collections spec §3; `docs/plans/2026-06-13-app-architecture-foundation.md` §3). This module resolves *which words a learner's activated collections contain*, so the session-builder gate can rescue them.

It is a sibling to `lib/lessons/` — a separate noun, NOT folded in (`lib/lessons/` is past its public-API width ceiling). **No back-edges** (target-architecture Rule 7): it must not import `lib/session-builder/`, `lib/scheduling/`, or `lib/analytics/` — session-builder consumes collections, never the reverse.

## 2. Public API (`index.ts`)

```ts
resolveActivatedMemberRefs(userId: string, client?): Promise<Set<string>>
```

Returns the set of capability `source_ref`s belonging to any collection the learner has activated. For item caps the form is `learning_items/<normalized_text>` — matching `PlannerCapability.sourceRef` and the HC9 live-DB invariant (`scripts/check-supabase-deep.ts`), so a member word's caps match by `source_ref` with no denormalized FK (collections spec §5, OQ#3).

## 3. Internal flow

`membership.ts` (logic) → `adapter.ts` (I/O), two reads:
1. `fetchActivatedCollectionIds(userId)` — `learner_collection_activation` rows for the user. Empty → return `∅` (no second query).
2. `fetchMemberNormalizedTexts(ids)` — `collection_items` filtered to those collections, one FK embed `learning_items(normalized_text)`.

`membership.ts` maps each `normalized_text` → `learning_items/<text>`. The `learning_items/` prefix is the module's hidden knowledge (the one place the source_ref convention is reconstructed).

## 4. Invariants

- The returned source_refs match item-cap `source_ref`s exactly (HC9 guarantees the DB form is `learning_items/<normalized_text>`). A mismatch silently fails to rescue — guarded by the membership unit tests (`__tests__/membership.test.ts`).
- Read-only. Activation *writes* go through the `set_collection_activation` RPC (slice 3), never this module's read path.

## 5. Seams

- **Downstream consumer:** `lib/session-builder/adapter.ts` calls `resolveActivatedMemberRefs` in its snapshot load and passes the result as `plannerInput.activatedCollectionRefs`; `pedagogy.ts:gateCandidates` ORs it with the lesson-activation gate (collections spec §5). See `docs/current-system/modules/session-builder.md`.
- **DB:** `collections`, `collection_items`, `learner_collection_activation`, `learning_items` (`scripts/migration.sql`, collections slice-1 schema).

## 6. What this spec does NOT cover (deferred — slice 3)

- The **activation write** (`setCollectionActivated` over the `set_collection_activation` RPC) and **collection listing** for the UI checklist.
- The **coverage read** (`{total, mastered, activated}` per collection) — must reuse the `get_lessons_overview` mastered predicate (foundation doc §4, data-architect M1).
- Frequency-band **membership materialisation** (`frequency_rank ≤ rank_cutoff` → `collection_items`) and its bidirectional projection-parity gates (collections spec §8) — these belong to the content/pipeline path, not this runtime module.
