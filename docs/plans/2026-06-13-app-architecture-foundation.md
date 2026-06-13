---
status: approved
reviewed_by: [architect, data-architect]   # both APPROVE-WITH-CHANGES; all changes folded in inline (lessons live-symbol count, roster-sync follow-up, coverage-RPC mastered-predicate contract M1, SECURITY INVOKER RLS-test obligation). No re-review needed.
supersedes: []
---

# App architecture foundation — IA, UI, target modules, data model

> **Purpose.** A durable, recognisable architecture to build the roadmap toward. It locks the **information architecture** (navigation skeleton), the **UI** (what each surface is and how the learner interacts with it), the **target modules** (where code lives, grounded in `docs/target-architecture.md`), and the **data model** (defined for what's imminent, explicitly deferred for what isn't).
>
> **Companions:** `docs/roadmap.md` (what to build), `docs/plans/2026-06-13-collections-and-frequency-bands.md` (the first feature on this foundation — collections, slice 1 schema shipped), `docs/target-architecture.md` (the locked module roster this aligns to), `memory/project_monetization_direction.md` (strategic context).
>
> **Grounding (per the plan-grounding rule).** Aligned to `docs/target-architecture.md`: the locked runtime roster (`:169-188`), the architectural rules — one job per module (`:41-45`), no back-edges (`:63-67`), don't spec dead infra on speculation (`:81-85`) — the depth/width rules (`:130-136`), and the runtime data flow (`:189-221`). No new module contradicts the locked roster; the only addition (`lib/collections/`) is justified against Rules 1/3 + the width ceiling on `lib/lessons/` below.

---

## 1. Organizing principle + navigation skeleton (LOCKED)

**Principle:** classify every surface by *what the learner does with it*, not by content type.

1. **Open-to-study** — rich surfaces you enter and work through (Lessons; the future Affix trainer).
2. **Check-to-schedule** — no surface to open; a toggle that adds content to the FSRS scheduler (frequency bands, thematic packs, podcast-decks, text-decks).
3. **Open-to-experience** — you enter to consume, not drill (Podcasts, Graded reading); each links to its study-deck (a kind-2 toggle).
4. **The session** — the single place all scheduled content is actually drilled.
5. **Insight & settings** — read-only progress; account/preferences.

**Five primary destinations** (mobile bottom-nav — fills the ~5-slot budget exactly):

| Icon | Tab | Role |
|---|---|---|
| 🏠 | **Home** | Launchpad — "Start practice" (the daily session), streak, goal progress |
| 📖 | **Leren** (Study) | Lessons grid (open) + affix trainer + the "what feeds my scheduler" toggles |
| 🎧 | **Input** (Luisteren & Lezen) | Podcasts + Graded reading; experience, then "study its words" |
| 📊 | **Voortgang** | Two-axis analytics + band **coverage** trackers + goal |
| 👤 | **Profiel** | Account + learning preferences |

Admin stays a gated `/admin/*` area reached from Profile — **not** a tab.

**Key move:** a band/deck is **one data object with two faces** — a **toggle in Leren** (action: add to scheduler) and a **coverage bar in Voortgang** (insight: 720/1000 known). It is never "opened"; the words it adds are drilled only in the **Home session**. This is how "bands are coverage trackers AND activatable" both resolve without a dedicated tab.

---

## 2. UI — what lives in each tab (LOCKED)

| Tab | Surfaces | New / exists | Interaction |
|---|---|---|---|
| **Home** | "Start practice" CTA → unified daily session; streak, goal-to-band progress, study-tips, at-risk count | `Dashboard.tsx` exists; most components shipped; **goal-to-band widget is new** (needs collections coverage read-model) | tap CTA → session |
| **Leren** | (a) **Lessons grid** · (b) **Affix trainer** · (c) **"Woordenlijsten" — the check-to-schedule list** | grid exists; affix trainer + lists surface are **new** | lesson → open reader; list → **toggle** (`set_collection_activation`) |
| **Input** | **Podcasts** (+ transcript/NL/speed aids) · **Graded reading** (tap-to-gloss) | Podcasts exist (aids new); **reading is new** | open to listen/read; each → "study its words" → its Leren deck |
| **Voortgang** | two-axis analytics (shipped) + **band coverage trackers** + goal | analytics shipped; **coverage trackers new** | read-only |
| **Profiel** | account + learning prefs + admin link | exists | settings |

**Imminent-work scope discipline.** The only *new surface* the collections / top-1000 work needs is **Leren → Woordenlijsten** (the checklist) + the **two read-model widgets** (Home goal, Voortgang coverage). Affix trainer, graded reading, and podcast aids get a **reserved home** in this map but **no detailed design now** (target-arch Rule 10) — each gets its own spec when built.

---

## 3. Target modules (deltas to the locked roster)

### Added now

**`lib/collections/`** — new runtime module, **sibling to `lib/lessons/`**. Chosen (not folded into `lib/lessons/`) because `lib/lessons/` is already **past** the width ceiling: the target names it "at the edge with 9 symbols" (`target-architecture.md:136`), but the *live* `src/lib/lessons/index.ts` re-exports ~20 value symbols — so folding a second noun in plainly violates Rule 3 (one job per module) and the width rule. Owns the *collection* noun:
- `listActivatedCollections(userId)` — parallels `lib/lessons/activation.ts:listActivatedLessons`
- membership resolution: `source_kind='item'` cap → strip `learning_items/` prefix → join `learning_items` on `normalized_text` (UNIQUE) → join `collection_items`
- coverage read (via RPC — §4)
- **No back-edges (Rule 7):** must not import `session-builder/`, `scheduling/`, or `analytics/`.
- Passes Rule 1 (hides real logic — membership resolution, projection), Rule 3 (one noun), the depth floor (`model`+`activation`+`membership`+`adapter`), and width (≪10 symbols).

### Modified now

**`lib/session-builder/`** — `adapter.ts` adds the collection-membership read to the snapshot it already assembles; `pedagogy.ts:gateCandidates` gets the **gate-OR clause** (suppress `not_activated` only if `lessonId ∉ activatedLessons` **AND** `itemRef ∉ anyActivatedCollection`). It *imports* `lib/collections` exactly as it already imports `lib/lessons` (`adapter.ts:2`) — a forward runtime→runtime edge, not a back-edge.

**Components:** new `components/collections/` (the Woordenlijsten checklist) now.

### Reserved — seam defined, schema/UX deferred (Rule 10)

Each gets its own spec (+ `data-architect` review) when built. These reserve a *home*; they are **not** designed and **not** assumed table-free.

| Reserved module | Owns | Consumes | Must NOT | Connects to |
|---|---|---|---|---|
| `lib/reading/` | reading passages + glossing | `learning_items` (gloss lookup); existing lesson text | import `session-builder` | spawns a theme `collection` |
| `lib/morphology/` | affixes + word-families (the affix trainer) | `capabilities` (`affixed_form_pair`), `allomorph_rule` | import `session-builder` | drills feed FSRS via existing/new cap types |
| (podcast/text-deck) | a `collection` back-linked to its source | `collections`, `podcasts` | — | Input → "study its words" → Leren deck |

`podcastService` **stays a service** (`target-architecture.md:184`); podcast aids are UI over the existing `podcasts` table. `components/reading/`, `components/morphology/` reserved.

**Roster-file sync (follow-up).** This doc is the delta record; the canonical roster table at `target-architecture.md:169-188` does not yet list these. A follow-up edit to that file must add `lib/collections/` (**LOCKED**) and `lib/reading/` / `lib/morphology/` (**RESERVED**) so the roster stays the single source of truth.

---

## 4. Data model

### Defined and DONE (collections — slice 1, shipped + idempotency-verified)

`collections`, `collection_items`, `learner_collection_activation` (+ indexes, RLS, grants), `learning_items.frequency_rank`, `lessons.is_hidden`, `source_type` extended with `'collection'`, the `set_collection_activation` RPC, and the hidden "Common Words" home lesson. This membership model carries **both** frequency bands **and** editorially-curated thematic packs (holiday, food) with **no further schema** — a curated pack is `collections(kind='theme')` + authored `collection_items`. (See `docs/plans/2026-06-13-collections-and-frequency-bands.md`.)

### The one near-term addition

A **coverage read RPC** (`get_collection_coverage` / `get_collections_overview`) returning `{total, mastered, activated}` per collection — server-side aggregation per **ADR 0015** (small result, no row-shipping). It feeds the Home goal widget + the Voortgang coverage bars, and is *why* `lib/collections` needs no `analytics` import (it reads an aggregate, not mastery internals).

> **Binding contract (data-architect M1):** the RPC's `mastered` count MUST reuse the **same** five-field mastered predicate already in `get_lessons_overview` (`migration.sql:2058-2063`, the SQL mirror of `src/lib/analytics/mastery/mastered.ts:24-33`, guarded by `lessons-overview-mastery-parity.test.ts`) — ideally via the extracted `_mastery_label` helper (`migration.sql:2234`). A *second*, ad-hoc "mastered" definition would make a band's coverage disagree with the lesson's mastered count for the same words. The RPC body must apply `review_count >= 4 AND coalesce(stability,0) >= 14 AND last_reviewed_at >= now() - interval '30 days' AND coalesce(consecutive_failure_count,0) = 0`, with a code comment citing the two canonical sites.

### Explicitly DEFERRED — NOT assumed table-free

Reserving a module home does **not** define its schema. Each of these carries its **own** data-model spec, reviewed by `data-architect` at build time when requirements are real:
- **Graded reading** — new authored passages **will** need storage (a `reading_texts` table or lesson rows) and likely a per-learner reading-state table. Reusing *existing* lesson text needs nothing; *new* content does.
- **Affix trainer** — a word-family explorer (root → all derived forms) may need a root/family relation; whether `affixed_form_pair` already suffices is **unverified** and must be checked, not assumed.
- **Podcast/text-deck source-linkage** — the Consume→Study cross-link likely wants a back-link column on `collections` (or a slug convention) — decided when decks are built.

**Why deferring the tables is safe here:** build-stage = disposable data + additive-then-truncate freedom (`CLAUDE.md` Operating Context). A reserved feature is an *additive consumer* — it adds tables/columns later; it does not reshape the core. The only expensive-to-change shapes (`learning_items`, `capabilities`, `collections`) are **already locked**, and nothing a reserved module needs forces a change to them. So there is no "paint into a corner" risk early schema would protect against.

---

## 5. Supabase Requirements

### Schema changes
- **Done (slice 1):** the collections tables/columns/RPC/seed above (in `scripts/migration.sql`).
- **Near-term:** the coverage read RPC (`scripts/migration.sql`; read-only, `SECURITY INVOKER` over RLS-protected tables, grant `execute` to `authenticated`). No new tables. **Obligation (architect WARNING):** because it is `SECURITY INVOKER` over RLS-protected tables, its own spec MUST include an `authenticated`-role test (`set local role authenticated` + `request.jwt.claims`, assert non-empty coverage) — the 2026-05-08 silent-empty regression class; a bare "callable-check" will not catch it.
- **Deferred:** reading + affix + deck-source schema — each in its own spec.
- **RLS / grants:** collections RLS/grants shipped in slice 1. The coverage RPC needs only `grant execute`. Reserved modules define their own.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (existing `indonesian` schema).
- [ ] Kong CORS — **N/A**.  [ ] GoTrue — **N/A**.  [ ] Storage — **N/A** (reading/podcast buckets, if any, are deferred to those features).

### Health check additions
- `check-supabase-deep.ts`: the bidirectional frequency-projection invariant + `source_ref`→item resolution (per the collections spec §8) land with slice 2/3, not this foundation doc.
- The coverage RPC gets a callable-check in `check-supabase.ts` when it lands.

---

## 6. What this foundation does and does NOT decide

**Decides (locked):** the 5-tab IA + the open/check/experience taxonomy; what each tab contains and its interaction model; the module *homes* for every roadmap surface; the collections data model.

**Does NOT decide (by design):** the detailed UX of reserved surfaces (reading glossing, affix drills, podcast aids); their tables; `frequency_rank` *population* mechanism and collection *materialisation* (a slice decision in the collections build); session-ordering by `frequency_rank` (out of scope, collections spec §4.1); entitlements/paywall (phase 2 — the activation RPCs are the seam).
